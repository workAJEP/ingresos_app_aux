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
  barcode: ['NUMERO', 'PIECENUMBER', 'CODIGODEBARRA', 'CODIGOBARRA', 'BARCODE', 'BARRAS', 'PECA', 'PIECE', 'ROLLNO', 'ROLLO', 'ROLO', 'NRO', 'NUM'],
  // `nombre` = ARTÍCULO del proveedor (JD100M / la descripción de la tela).
  // `cod_dist` = código interno Distefano (TTD-xxxx): NO viene en el packing
  // list del proveedor -> lo completa el usuario en la app (editor de
  // artículos), igual que el color legible y la composición.
  nombre: ['ARTICLE', 'ARTIGO', 'ARTICULO', 'DESCRIPCION', 'DESCRICAO', 'NOMBRE', 'TEJIDO'],
  color: ['COLOR', 'COR'],
  lote: ['LOTE', 'LOT'],
  metros: ['METRO', 'METRAGEM', 'MTS', 'MTR', 'QUANTITY', 'QTDE', 'CANTIDAD'],
  yardas: ['YARDA', 'JARDA', 'YD'],
  peso_neto: ['PESONETO', 'NETWEIGHT', 'NETO', 'LIQUIDO', 'NET'],
};

// Etiquetas del membrete que identifican al PROVEEDOR (el dato va en la celda
// siguiente de la misma fila, o en la fila de abajo).
const PROVEEDOR_LABELS = ['VENDEDOR', 'PROVEEDOR', 'SHIPPER', 'SELLER', 'EXPORTADOR', 'EXPORTER', 'VENDOR', 'SUPPLIER'];

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

// Puntaje de "parecido a cabecera" de una fila: cuántos campos distintos
// reconoce entre sus celdas.
function scoreCabecera(fila) {
  const textos = fila.map(norm);
  let score = 0;
  for (const claves of Object.values(SINONIMOS)) {
    if (textos.some((t) => t && claves.some((k) => t.includes(k)))) score++;
  }
  return score;
}

// TODAS las filas de cabecera del documento. Muchos packing lists (Vicunha
// FC/PL) traen VARIOS ARTÍCULOS en un mismo archivo, cada uno con su propio
// membrete (Descripcion/Color) y su propia tabla con cabecera repetida — cada
// cabecera abre una SECCIÓN. Se toma la mejor fila de las primeras 60 como
// referencia y luego toda fila con puntaje comparable (>= max(3, best-1)) en
// el resto del archivo; se saltan las filas pegadas a una cabecera ya elegida
// (segunda/tercera línea de una cabecera multi-fila).
function detectarCabeceras(rows) {
  let best = 0;
  let bestIdx = 0;
  const limite = Math.min(rows.length, 60);
  for (let i = 0; i < limite; i++) {
    const s = scoreCabecera(rows[i]);
    if (s > best) {
      best = s;
      bestIdx = i;
    }
  }
  const umbral = Math.max(3, best - 1);
  const idxs = [];
  for (let i = 0; i < rows.length; i++) {
    if (idxs.length && i - idxs[idxs.length - 1] <= 3) continue;
    if (scoreCabecera(rows[i]) >= umbral) idxs.push(i);
  }
  if (!idxs.length) idxs.push(bestIdx);
  return { idxs, score: best };
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

// ¿La fila parece continuación de una descripción multi-línea? ("COLORES",
// "DE DISTINTOS COLORES", "SARGA 3X1-Z, TENIDO"): texto sin ':' que no sea
// una etiqueta de membrete ni una cabecera de tabla.
function esContinuacionDescripcion(s) {
  if (!s || s.includes(':') || s.length > 80) return false;
  const u = sinAcentos(s).toUpperCase();
  // "COLORES" sí es continuación válida ("HILADOS DE DISTINTOS / COLORES");
  // las etiquetas "Color:" ya quedan fuera por el ':' de arriba.
  if (/^(DESCRIPCION|DESCRICAO|ARTIGO|ARTICULO|CALIDAD|PEDIDO|EMBALAJE|LOTE|TOTAL)/.test(u)) return false;
  return /^[A-Z0-9 ,.%\-/()]+$/.test(u) && /[A-Z]{3,}/.test(u);
}

// Extrae metadatos del membrete de una ZONA [desde, hasta) del archivo:
// artículo/descripción (multi-línea), color y composición. Cada sección de un
// packing multi-artículo tiene su propia zona; si el layout no trae esas
// columnas por fila, estos valores aplican a todos los rollos de la sección.
function extraerMeta(rows, desde, hasta) {
  let descripcion = '';
  let color = '';
  let ref = '';
  const ini = Math.max(0, desde);
  const fin = Math.min(hasta, rows.length);
  for (let i = ini; i < fin; i++) {
    for (const cell of rows[i]) {
      const s = String(cell || '').trim();
      if (!s) continue;
      const u = sinAcentos(s).toUpperCase();
      if (!color) {
        const m = s.match(/(?:COLOR|COR|TONO)\s*[:.]?\s*([A-Za-z0-9\-]{2,})/i);
        if (m && /^(COLOR|COR|TONO)\b/.test(u.replace(/[:.]/, ' '))) color = m[1];
      }
      if (!descripcion) {
        if (/^DESCRIPCION|^DESCRICAO|^ARTIGO|^ARTICULO/.test(u) && s.length < 20) {
          for (let j = i + 1; j < Math.min(i + 4, fin); j++) {
            const v = String(rows[j][0] || rows[j].find((x) => String(x).trim()) || '').trim();
            if (v) {
              descripcion = v;
              // Continuación en la(s) fila(s) siguiente(s): "…HILADOS DE
              // DISTINTOS" + "COLORES" van partidos en dos filas.
              for (let k = j + 1; k < Math.min(j + 3, fin); k++) {
                const cont = String(rows[k][0] || rows[k].find((x) => String(x).trim()) || '').trim();
                if (!esContinuacionDescripcion(cont)) break;
                descripcion += ' ' + cont;
              }
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

// Proveedor desde el membrete inicial: la celda siguiente a la etiqueta
// (Vendedor | VICUNHA ECUADOR S.A.) o, si no hay, la fila de abajo en la
// misma columna.
function extraerProveedor(rows, hasta) {
  const fin = Math.min(hasta, rows.length, 40);
  for (let i = 0; i < fin; i++) {
    for (let c = 0; c < rows[i].length; c++) {
      const u = norm(rows[i][c]);
      if (!u || !PROVEEDOR_LABELS.some((k) => u === k || u.startsWith(k))) continue;
      for (let cc = c + 1; cc < rows[i].length; cc++) {
        const v = String(rows[i][cc] || '').trim();
        if (v && /[A-Za-z]{3,}/.test(v)) return v;
      }
      if (i + 1 < rows.length) {
        const v = String(rows[i + 1][c] || '').trim();
        if (v && /[A-Za-z]{3,}/.test(v)) return v;
      }
    }
  }
  return '';
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
// Mapeo de columnas (etiqueta -> columna de datos) para una sección: cabecera
// en headerIdx, datos hasta `fin` (exclusivo).
function mapearColumnas(grid, headerIdx, fin, nCols) {
  const cab = textoCabecera(grid, headerIdx, nCols);
  const colEtiqueta = {};
  for (const [campo, claves] of Object.entries(SINONIMOS)) {
    const c = buscarEtiqueta(cab, claves);
    if (c != null) colEtiqueta[campo] = c;
  }

  // Filas de muestra para validar tipos.
  const muestras = [];
  for (let i = headerIdx + 1; i < fin && muestras.length < 30; i++) {
    if (grid[i].some((v) => esBarcode(v))) muestras.push(grid[i]);
  }

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
  return colDato;
}

export function parseGrid(grid) {
  const nCols = grid.reduce((m, r) => Math.max(m, r.length), 0);

  // SECCIONES: cada cabecera de tabla abre una (packing multi-artículo). El
  // membrete de la sección k va entre la cabecera anterior y la suya.
  const { idxs: headerIdxs } = detectarCabeceras(grid);
  const proveedor = extraerProveedor(grid, headerIdxs[0]);

  let totalFilas = 0;
  let descartadasSinBarcode = 0;
  let duplicadasEnArchivo = 0;
  const vistos = new Set();
  const rows = [];
  const articulos = [];
  let metaPrev = null; // meta heredada: cabecera repetida por página SIN membrete nuevo

  for (let k = 0; k < headerIdxs.length; k++) {
    const headerIdx = headerIdxs[k];
    const fin = k + 1 < headerIdxs.length ? headerIdxs[k + 1] : grid.length;
    const desdeMembrete = k === 0 ? 0 : headerIdxs[k - 1] + 1;

    let meta = extraerMeta(grid, desdeMembrete, headerIdx);
    // Sin membrete propio (cabecera repetida por paginación): heredar el de
    // la sección anterior.
    if (!meta.descripcion && !meta.color && metaPrev) meta = metaPrev;
    metaPrev = meta;
    if (meta.ref && !articulos.includes(meta.ref)) articulos.push(meta.ref);

    const colDato = mapearColumnas(grid, headerIdx, fin, nCols);
    if (colDato.barcode < 0) continue;

    for (let i = headerIdx + 1; i < fin; i++) {
      const barcode = normBarcode(grid[i][colDato.barcode]);
      if (!barcode || !esBarcode(barcode)) continue;
      const fila = grid[i];
      totalFilas++;
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
  }

  const metaPrimera = extraerMeta(grid, 0, headerIdxs[0]);
  return {
    rows,
    totalFilas,
    descartadasSinBarcode,
    duplicadasEnArchivo,
    meta: {
      articulo: articulos.join(', ') || metaPrimera.ref,
      descripcion: metaPrimera.descripcion,
      color: metaPrimera.color,
      composicion: metaPrimera.composicion,
      proveedor,
      secciones: headerIdxs.length,
      columnasDetectadas: mapearColumnas(grid, headerIdxs[0], headerIdxs[1] || grid.length, nCols),
      filaCabecera: headerIdxs[0],
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
