// Extractor DINÁMICO del packing list, independiente del formato y del origen
// (Excel/CSV aquí; PDF vía lib/parsePdf.js que convierte a la misma grilla).
//
// Los packing lists reales (Vicunha, Santista, Ecuador…) NO comparten layout:
// cabecera en filas variables (a veces doble), membrete previo, celdas
// combinadas que desplazan la columna del dato respecto a la etiqueta,
// decimales con coma, subtotales intercalados, y campos por artículo
// (nombre/color/composición) que pueden ir en el encabezado O por fila.
//
// Estrategia (todo opera sobre una GRILLA = array de filas = array de celdas):
//  1) Detectar la fila de cabecera por densidad de palabras clave.
//  2) Combinar 2-3 filas de cabecera en un "texto de cabecera" por columna
//     (resuelve cabeceras multi-fila tipo PESO / NETO / KG o PIECE / Number).
//  3) Mapear cada campo con PRIORIDAD POR SINÓNIMO (el primer sinónimo que
//     matchea manda: 'METRO' gana a 'CANTIDAD') y elegir la columna de DATOS
//     por tipo (numérica / código) validando contra filas de muestra — corrige
//     el desfase que producen celdas combinadas.
//  4) Extraer artículo/color/composición del membrete; si además hay columnas
//     por fila (Article/Color de Santista), la fila manda sobre el membrete.
//  5) Números con coma decimal; yardas calculadas desde metros si faltan.
import * as XLSX from 'xlsx';

// Sinónimos por campo (ES / PT / EN), EN ORDEN DE PRIORIDAD. Se comparan en
// MAYÚSCULAS sin acentos ni separadores.
const SINONIMOS = {
  pieza: ['SEQPACK', 'SEQ', 'PIEZA', 'PECA', 'ITEM', 'ORDEM'],
  barcode: ['NUMERO', 'PIECENUMBER', 'CODIGODEBARRA', 'CODIGOBARRA', 'BARCODE', 'BARRAS', 'PECA', 'PIECE', 'ROLLO', 'ROLO', 'NRO', 'NUM'],
  // `nombre` = ARTÍCULO del proveedor (JD100M / la descripción de la tela).
  // `cod_dist` = código interno Distefano (TTD-xxxx): NO viene en el packing
  // list del proveedor -> lo completa el usuario en la app (editor de
  // artículos), igual que el color legible y la composición.
  nombre: ['ARTICLE', 'ARTIGO', 'ARTICULO', 'DESCRIPCION', 'DESCRICAO', 'NOMBRE', 'TEJIDO'],
  color: ['COLOR', 'COR'],
  lote: ['LOTE', 'LOT'],
  metros: ['METRO', 'METRAGEM', 'MTS', 'QUANTITY', 'QTDE', 'CANTIDAD'],
  yardas: ['YARDA', 'JARDA', 'YD'],
  peso_neto: ['NETO', 'LIQUIDO', 'NET'],
};

const YARDAS_POR_METRO = 1.09361;

function sinAcentos(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function norm(s) {
  return sinAcentos(s).toUpperCase().replace(/[\s\r\n\t.\-_/]+/g, '');
}

// Número con coma o punto decimal, y separador de miles opcional.
// "107,760" -> 107.76 ; "5.031,3302" -> 5031.3302 ; "73.5" -> 73.5
export function parseNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/\s+/g, '');
  if (!s) return 0;
  const tieneComa = s.includes(',');
  const tienePunto = s.includes('.');
  if (tieneComa && tienePunto) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (tieneComa) {
    s = s.replace(',', '.');
  }
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
}

// Barcode tal cual viene en el packing list: MAYÚSCULAS sin espacios, SIN
// recortar (el recorte de 2 chars extra es solo un fallback al ESCANEAR).
function normBarcode(raw) {
  return String(raw == null ? '' : raw).toUpperCase().replace(/[\r\n\t\s]+/g, '');
}

function esCodigo(v) {
  const s = String(v == null ? '' : v).trim();
  return /[A-Za-z0-9]{2,}/.test(s); // acepta códigos cortos: '58L', '818', 'LPP'
}

// Barcode REAL de rollo: alfanumérico de 6-40, con al menos 4 dígitos. Descarta
// encabezados repetidos ("NUMERO", "PIECE") y textos de subtotal ("TOTAL OF").
function esBarcode(v) {
  const s = String(v == null ? '' : v)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (s.length < 6 || s.length > 40) return false;
  if (!/^[A-Z0-9\-]+$/.test(s)) return false;
  return (s.match(/\d/g) || []).length >= 4;
}

function esNumerico(v) {
  if (v == null || v === '') return false;
  if (typeof v === 'number') return true;
  return /\d/.test(String(v)) && parseNum(v) > 0;
}

// Fila de cabecera = la de mayor cantidad de campos distintos reconocidos,
// dentro de las primeras 60 filas.
function detectarCabecera(rows) {
  let best = -1;
  let idx = 0;
  const limite = Math.min(rows.length, 60);
  for (let i = 0; i < limite; i++) {
    const textos = rows[i].map(norm);
    let score = 0;
    for (const claves of Object.values(SINONIMOS)) {
      if (textos.some((t) => t && claves.some((k) => t.includes(k)))) score++;
    }
    if (score > best) {
      best = score;
      idx = i;
    }
  }
  return { idx, score: best };
}

// Texto de cabecera combinado por columna (fila cabecera ± vecinas) — junta
// cabeceras multi-fila (PESO / NETO / KG, PIECE / Number).
function textoCabecera(rows, headerIdx, nCols) {
  const filas = [headerIdx - 1, headerIdx, headerIdx + 1, headerIdx + 2].filter((r) => r >= 0 && r < rows.length);
  const out = new Array(nCols).fill('');
  for (const r of filas) {
    for (let c = 0; c < nCols; c++) out[c] += ' ' + (rows[r][c] || '');
  }
  return out.map(norm);
}

// Desde la columna de la etiqueta, elige la columna de DATOS validando el tipo
// contra filas de muestra (corrige el desfase de celdas combinadas).
function elegirColumnaDatos(muestras, hc, tipo, nCols) {
  const test = tipo === 'num' ? esNumerico : tipo === 'bc' ? esBarcode : esCodigo;
  // Candidatas con fill >= 0.5; gana la MÁS CERCANA a la columna de la
  // etiqueta (evita que "Net" agarre "Gross", o "Quantity" agarre "Net" —
  // varias columnas numéricas vecinas todas llenas). Ante empate de
  // distancia, mayor fill.
  let mejor = -1;
  let mejorDist = Infinity;
  let mejorFill = 0;
  for (let c = Math.max(0, hc - 1); c <= Math.min(hc + 10, nCols - 1); c++) {
    let ok = 0;
    for (const fila of muestras) {
      if (test(fila[c])) ok++;
    }
    const fill = muestras.length ? ok / muestras.length : 0;
    if (fill < 0.5) continue;
    const dist = Math.abs(c - hc);
    // Empate de distancia: gana la columna a la DERECHA de la etiqueta (en
    // estos layouts el dato cae a la derecha; la de la izquierda es la
    // columna vecina anterior, p.ej. Gross cuando la etiqueta es Net).
    const gana =
      dist < mejorDist ||
      (dist === mejorDist && mejor < hc && c > hc) ||
      (dist === mejorDist && (mejor > hc) === (c > hc) && fill > mejorFill);
    if (gana) {
      mejorDist = dist;
      mejorFill = fill;
      mejor = c;
    }
  }
  return mejor;
}

// Columna de la ETIQUETA con prioridad por sinónimo: el primer sinónimo de la
// lista que matchea alguna columna gana (evita que 'CANTIDAD' se robe la
// columna cuando también existe 'METROS').
function buscarEtiqueta(cab, claves) {
  for (const k of claves) {
    for (let c = 0; c < cab.length; c++) {
      if (cab[c] && cab[c].includes(k)) return c;
    }
  }
  return null;
}

// Extrae metadatos del membrete (aplican a todo el archivo cuando el layout no
// trae esas columnas por fila).
function extraerMeta(rows, headerIdx) {
  let descripcion = '';
  let color = '';
  let ref = '';
  const limite = Math.min(headerIdx, 60);
  for (let i = 0; i < limite; i++) {
    for (const cell of rows[i]) {
      const s = String(cell || '').trim();
      if (!s) continue;
      const u = sinAcentos(s).toUpperCase();
      if (!color) {
        const m = s.match(/(?:COR|COLOR)\s*:?\s*([A-Za-z0-9\-]+)/i);
        if (m && u.startsWith('COR')) color = m[1];
      }
      if (!descripcion) {
        if (/^DESCRIPCION|^DESCRICAO|^ARTIGO|^ARTICULO/.test(u) && s.length < 20) {
          for (let j = i + 1; j < Math.min(i + 4, limite); j++) {
            const v = String(rows[j][0] || rows[j].find((x) => String(x).trim()) || '').trim();
            if (v) {
              descripcion = v;
              break;
            }
          }
        } else if (u.includes('%') || /\d+%\s*[A-Z]/.test(u)) {
          if (s.length > 20) descripcion = s;
        }
      }
    }
  }
  if (descripcion) {
    const refM = descripcion.match(/^([A-Z0-9]{6,})\s*[-–]/i);
    if (refM) ref = refM[1];
  }
  let composicion = '';
  const comp = (descripcion.match(/\d{1,3}\s*%\s*[A-Za-zÁÉÍÓÚÑ]+/g) || []).join(', ');
  if (comp) composicion = comp;
  return { descripcion, color, ref, composicion };
}

function truncar(s, n) {
  s = String(s == null ? '' : s).trim();
  return s.length > n ? s.slice(0, n) : s;
}

/**
 * Núcleo universal: recibe una GRILLA (array de filas; cada fila array de
 * celdas string/number) y devuelve { rows, totalFilas, descartadasSinBarcode,
 * duplicadasEnArchivo, meta }. La usan parseExcel (XLSX/CSV) y parsePdf.
 */
export function parseGrid(grid) {
  const nCols = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const { idx: headerIdx } = detectarCabecera(grid);
  const cab = textoCabecera(grid, headerIdx, nCols);
  const meta = extraerMeta(grid, headerIdx);

  // Columna de la etiqueta por campo (prioridad por sinónimo).
  const colEtiqueta = {};
  for (const [campo, claves] of Object.entries(SINONIMOS)) {
    const c = buscarEtiqueta(cab, claves);
    if (c != null) colEtiqueta[campo] = c;
  }

  // Filas de muestra para validar tipos.
  const muestras = [];
  for (let i = headerIdx + 1; i < grid.length && muestras.length < 30; i++) {
    if (grid[i].some((v) => esBarcode(v))) muestras.push(grid[i]);
  }

  // Columna de DATOS por campo.
  const colDato = {};
  colDato.cod_dist = -1; // TTD-xxxx: lo completa el usuario, no viene en el archivo
  colDato.pieza = colEtiqueta.pieza != null ? elegirColumnaDatos(muestras, colEtiqueta.pieza, 'cod', nCols) : -1;
  if (colDato.pieza < 0 && colEtiqueta.pieza != null) colDato.pieza = colEtiqueta.pieza;
  if (colDato.pieza < 0) colDato.pieza = 0;

  colDato.barcode =
    colEtiqueta.barcode != null ? elegirColumnaDatos(muestras, colEtiqueta.barcode, 'bc', nCols) : -1;
  if (colDato.barcode < 0) {
    // Fallback: la columna con más barcodes reales.
    let mejor = -1;
    let mejorN = 0;
    for (let c = 0; c < nCols; c++) {
      let n = 0;
      for (const f of muestras) if (esBarcode(f[c])) n++;
      if (n > mejorN) {
        mejorN = n;
        mejor = c;
      }
    }
    colDato.barcode = mejor;
  }

  for (const campo of ['metros', 'yardas', 'peso_neto']) {
    colDato[campo] = colEtiqueta[campo] != null ? elegirColumnaDatos(muestras, colEtiqueta[campo], 'num', nCols) : -1;
  }
  for (const campo of ['lote', 'color', 'nombre']) {
    colDato[campo] = colEtiqueta[campo] != null ? elegirColumnaDatos(muestras, colEtiqueta[campo], 'cod', nCols) : -1;
  }
  // color/nombre por fila no deben ser la misma columna que el barcode.
  for (const campo of ['color', 'nombre', 'pieza', 'lote']) {
    if (colDato[campo] === colDato.barcode) colDato[campo] = campo === 'pieza' ? 0 : -1;
  }

  // Filas de datos: las que tienen barcode válido en la columna detectada
  // (salta membretes, cabeceras repetidas por página y subtotales).
  const filasDatos = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const bc = normBarcode(grid[i][colDato.barcode]);
    if (bc && esBarcode(bc)) filasDatos.push(grid[i]);
  }

  let descartadasSinBarcode = 0;
  let duplicadasEnArchivo = 0;
  const vistos = new Set();
  const rows = [];

  for (const fila of filasDatos) {
    const barcode = normBarcode(fila[colDato.barcode]);
    if (!barcode) {
      descartadasSinBarcode++;
      continue;
    }
    if (vistos.has(barcode)) {
      duplicadasEnArchivo++;
      continue;
    }
    vistos.add(barcode);

    const metros = colDato.metros >= 0 ? parseNum(fila[colDato.metros]) : 0;
    // Yards: si el packing list NO trae columna de yardas, se usa la cantidad
    // TAL CUAL (sin convertir) — así lo maneja el negocio (docs/Recepcion MP.xlsx:
    // Quantity 100.60 del packing list se imprime como Yards 100.60).
    let yardas = colDato.yardas >= 0 ? parseNum(fila[colDato.yardas]) : 0;
    if (!yardas && metros) yardas = metros;

    const colorFila = colDato.color >= 0 ? String(fila[colDato.color] || '').trim() : '';
    const codDistFila = colDato.cod_dist >= 0 ? String(fila[colDato.cod_dist] || '').trim() : '';
    const nombreFila = colDato.nombre >= 0 ? String(fila[colDato.nombre] || '').trim() : '';

    rows.push({
      pieza: truncar(fila[colDato.pieza], 64),
      cod_dist: truncar(codDistFila, 64),
      nombre: truncar(nombreFila || meta.descripcion || meta.ref, 128),
      color: truncar(colorFila || meta.color, 64),
      composicion: truncar(meta.composicion, 128),
      barcode,
      peso_neto: colDato.peso_neto >= 0 ? parseNum(fila[colDato.peso_neto]) : 0,
      metros,
      yardas,
    });
  }

  return {
    rows,
    totalFilas: filasDatos.length,
    descartadasSinBarcode,
    duplicadasEnArchivo,
    meta: {
      articulo: meta.ref,
      descripcion: meta.descripcion,
      color: meta.color,
      composicion: meta.composicion,
      columnasDetectadas: colDato,
      filaCabecera: headerIdx,
    },
  };
}

/**
 * Excel/CSV: Buffer -> grilla -> parseGrid.
 */
export function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false });
  return parseGrid(grid);
}
