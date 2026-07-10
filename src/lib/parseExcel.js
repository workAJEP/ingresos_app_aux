// Extractor DINÁMICO del packing list (Excel/CSV), independiente del formato.
//
// Los packing lists reales (p.ej. Vicunha, Santista, Ecuador) NO comparten
// layout: cabecera en filas variables, membrete previo, celdas combinadas que
// desplazan la columna del dato respecto a la etiqueta, decimales con coma, y
// campos por artículo (nombre/color/composición) que van en el encabezado —
// iguales para todos los rollos del archivo.
//
// Estrategia:
//  1) Detectar la fila de cabecera por densidad de palabras clave.
//  2) Combinar 2-3 filas de cabecera en un "texto de cabecera" por columna
//     (resuelve cabeceras multi-fila tipo PESO / NETO / KG).
//  3) Mapear cada campo: localizar la columna cuya cabecera contiene un
//     sinónimo y, desde ahí, elegir la columna de DATOS por tipo (numérica /
//     código) validando contra filas de muestra — así se corrige el desfase
//     que producen las celdas combinadas.
//  4) Extraer artículo/color/composición del membrete (aplican a todo el lote).
//  5) Parsear números con coma decimal y calcular yardas desde metros.
import * as XLSX from 'xlsx';

// Sinónimos por campo (ES / PT / EN). Se comparan en MAYÚSCULAS sin acentos.
const SINONIMOS = {
  pieza: ['PIEZA', 'PECA', 'ITEM', 'SEQ', 'ORDEM'],
  barcode: ['NUMERO', 'CODIGODEBARRA', 'CODIGOBARRA', 'BARCODE', 'BARRAS', 'ROLLO', 'ROLO', 'NRO', 'NUM'],
  lote: ['LOTE', 'LOT'],
  metros: ['METRO', 'METRAGEM', 'MTS', 'MT'],
  yardas: ['YARDA', 'JARDA', 'YD'],
  peso_neto: ['NETO', 'LIQUIDO', 'NET'],
  color: ['COLOR', 'COR', 'NUANCE'],
  nombre: ['ARTIGO', 'ARTICULO', 'DESCRIPCION', 'DESCRICAO', 'NOMBRE', 'TEJIDO'],
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
function parseNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/\s+/g, '');
  if (!s) return 0;
  const tieneComa = s.includes(',');
  const tienePunto = s.includes('.');
  if (tieneComa && tienePunto) {
    // El último separador es el decimal; el otro es de miles.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (tieneComa) {
    s = s.replace(',', '.');
  }
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
}

// Barcode tal cual viene en el packing list: MAYÚSCULAS sin espacios, SIN
// recortar los 2 últimos chars (ese recorte es solo al ESCANEAR).
function normBarcode(raw) {
  return String(raw == null ? '' : raw).toUpperCase().replace(/[\r\n\t\s]+/g, '');
}

function esCodigo(v) {
  const s = String(v == null ? '' : v).trim();
  return /[A-Za-z0-9]{5,}/.test(s) && !/^\d{1,4}$/.test(s); // código alfanumérico, no un simple correlativo
}

// Barcode REAL de rollo: alfanumérico de 6-40, con al menos 4 dígitos. Descarta
// encabezados repetidos ("NUMERO", "PIEZA") y textos de subtotal ("TOTAL") que
// se repiten por sub-lote y falsearían el conteo de creados/duplicados.
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
// dentro de las primeras 45 filas.
function detectarCabecera(rows) {
  let best = -1;
  let idx = 0;
  const limite = Math.min(rows.length, 45);
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

// Texto de cabecera combinado por columna (fila cabecera + 2 siguientes + 1
// anterior) — junta cabeceras multi-fila (PESO / NETO / KG).
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
  let mejor = -1;
  let mejorFill = 0;
  for (let c = hc; c <= Math.min(hc + 10, nCols - 1); c++) {
    let ok = 0;
    const test = tipo === 'num' ? esNumerico : tipo === 'bc' ? esBarcode : esCodigo;
    for (const fila of muestras) {
      if (test(fila[c])) ok++;
    }
    const fill = muestras.length ? ok / muestras.length : 0;
    if (fill >= 0.5 && fill > mejorFill) {
      mejorFill = fill;
      mejor = c;
    }
  }
  return mejor;
}

// Extrae metadatos del membrete (aplican a todo el archivo).
function extraerMeta(rows, headerIdx) {
  let descripcion = '';
  let color = '';
  let ref = '';
  const limite = Math.min(headerIdx, 45);
  for (let i = 0; i < limite; i++) {
    for (const cell of rows[i]) {
      const s = String(cell || '').trim();
      if (!s) continue;
      const u = sinAcentos(s).toUpperCase();
      // Color: "Cor:D1000" / "COLOR: X"
      if (!color) {
        const m = s.match(/(?:COR|COLOR)\s*:?\s*([A-Za-z0-9\-]+)/i);
        if (m && u.startsWith('COR')) color = m[1];
      }
      // Descripción/artículo: la etiqueta y el valor pueden ir en filas
      // distintas; si la celda ES la etiqueta, tomamos la siguiente no vacía.
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
          // línea que ya parece descripción con composición
          if (s.length > 20) descripcion = s;
        }
      }
    }
  }
  // Referencia (código de artículo) y composición desde la descripción.
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
 * Recibe un Buffer del archivo subido. Devuelve
 * { rows, totalFilas, descartadasSinBarcode, duplicadasEnArchivo, meta }.
 * `rows` trae los 9 campos que espera cargar_rollos.
 */
export function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false });

  const nCols = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const { idx: headerIdx } = detectarCabecera(grid);
  const cab = textoCabecera(grid, headerIdx, nCols);
  const meta = extraerMeta(grid, headerIdx);

  // Localiza la columna de la ETIQUETA de cada campo.
  const colEtiqueta = {};
  for (const [campo, claves] of Object.entries(SINONIMOS)) {
    for (let c = 0; c < nCols; c++) {
      if (cab[c] && claves.some((k) => cab[c].includes(k))) {
        colEtiqueta[campo] = c;
        break;
      }
    }
  }

  // Filas de muestra para validar tipos: las primeras ~25 tras la cabecera con
  // algún código alfanumérico (candidato a barcode).
  const muestras = [];
  for (let i = headerIdx + 1; i < grid.length && muestras.length < 25; i++) {
    if (grid[i].some((v) => esBarcode(v))) muestras.push(grid[i]);
  }

  // Mapea columna de DATOS por campo.
  const colDato = {};
  colDato.pieza = colEtiqueta.pieza != null ? colEtiqueta.pieza : 0;
  colDato.barcode =
    colEtiqueta.barcode != null ? elegirColumnaDatos(muestras, colEtiqueta.barcode, 'bc', nCols) : -1;
  if (colDato.barcode < 0) {
    // Fallback: la columna con más barcodes reales (alfanuméricos con dígitos).
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
  for (const campo of ['metros', 'yardas', 'peso_neto', 'lote']) {
    if (colEtiqueta[campo] != null) {
      colDato[campo] = elegirColumnaDatos(muestras, colEtiqueta[campo], campo === 'lote' ? 'cod' : 'num', nCols);
    } else {
      colDato[campo] = -1;
    }
  }

  // Recorre las filas de datos: desde la cabecera hasta el final, tomando las
  // que tienen barcode válido en la columna detectada.
  const totalFilasCand = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const bc = normBarcode(grid[i][colDato.barcode]);
    if (bc && esBarcode(bc)) totalFilasCand.push(grid[i]);
  }

  let descartadasSinBarcode = 0;
  let duplicadasEnArchivo = 0;
  const vistos = new Set();
  const rows = [];

  for (const fila of totalFilasCand) {
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
    let yardas = colDato.yardas >= 0 ? parseNum(fila[colDato.yardas]) : 0;
    if (!yardas && metros) yardas = Math.round(metros * YARDAS_POR_METRO * 100) / 100;

    rows.push({
      pieza: truncar(fila[colDato.pieza], 64),
      cod_dist: '', // no viene en el packing list del proveedor; se enriquece luego
      nombre: truncar(meta.descripcion || meta.ref, 128),
      color: truncar(meta.color, 64),
      composicion: truncar(meta.composicion, 128),
      barcode,
      peso_neto: colDato.peso_neto >= 0 ? parseNum(fila[colDato.peso_neto]) : 0,
      metros,
      yardas,
    });
  }

  return {
    rows,
    totalFilas: totalFilasCand.length,
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
