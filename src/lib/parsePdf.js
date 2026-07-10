// Extractor de packing list en PDF (texto nativo, no escaneado).
//
// Convierte el PDF a la MISMA grilla que usa parseExcel: extrae los items de
// texto con sus coordenadas (pdfjs-dist), agrupa por Y en filas y por
// clustering de X en columnas (las posiciones X de una tabla son estables
// entre filas y páginas), y delega TODA la interpretación al núcleo universal
// parseGrid (detección de cabecera, mapeo por sinónimos + tipo de dato,
// decimales con coma, subtotales, etc.). Universal: no asume proveedor.
//
// PDFs escaneados (imagen, sin capa de texto) no son extraíbles aquí: se
// devuelve un error claro pidiendo el Excel/CSV o un PDF con texto.
import { parseGrid } from './parseExcel.js';

const TOL_Y = 2.5; // pt: items a menos de esto de distancia vertical = misma fila
const TOL_X = 9; // pt: posiciones X a menos de esto = misma columna

async function extraerFilasPdf(buffer) {
  // Build legacy = compatible con Node (server-side de Next).
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const filas = []; // [{ y, page, cells: [{x, s}] }] en orden de lectura
  let totalItems = 0;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str.trim() }));
    totalItems += items.length;

    const filasPagina = [];
    for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const f = filasPagina.find((r) => Math.abs(r.y - it.y) < TOL_Y);
      if (f) f.cells.push(it);
      else filasPagina.push({ y: it.y, cells: [it] });
    }
    for (const f of filasPagina) {
      f.cells.sort((a, b) => a.x - b.x);
      filas.push(f);
    }
  }

  return { filas, totalItems, numPages: doc.numPages };
}

// Clustering global de posiciones X -> índice de columna. Solo se calibra con
// las filas "tabulares" (4+ celdas), para que los textos largos del membrete
// no distorsionen las columnas de la tabla.
function construirColumnas(filas) {
  const xs = [];
  for (const f of filas) {
    if (f.cells.length >= 4) for (const c of f.cells) xs.push(c.x);
  }
  xs.sort((a, b) => a - b);

  const centros = [];
  for (const x of xs) {
    const c = centros.find((k) => Math.abs(k.centro - x) < TOL_X);
    if (c) {
      c.suma += x;
      c.n++;
      c.centro = c.suma / c.n;
    } else {
      centros.push({ centro: x, suma: x, n: 1 });
    }
  }
  centros.sort((a, b) => a.centro - b.centro);
  return centros.map((c) => c.centro);
}

function filaAGrilla(fila, centros) {
  const out = new Array(centros.length).fill('');
  for (const cell of fila.cells) {
    let mejor = 0;
    let mejorDist = Infinity;
    for (let i = 0; i < centros.length; i++) {
      const d = Math.abs(centros[i] - cell.x);
      if (d < mejorDist) {
        mejorDist = d;
        mejor = i;
      }
    }
    out[mejor] = out[mejor] ? out[mejor] + ' ' + cell.s : cell.s;
  }
  return out;
}

/**
 * Buffer del PDF -> { rows, totalFilas, descartadasSinBarcode,
 * duplicadasEnArchivo, meta } (mismo contrato que parseExcel).
 * Lanza Error con mensaje claro si el PDF no tiene capa de texto.
 */
export async function parsePdf(buffer) {
  const { filas, totalItems } = await extraerFilasPdf(buffer);

  if (!totalItems) {
    throw new Error(
      'El PDF no tiene texto extraíble (parece escaneado). Sube el packing list en Excel/CSV o un PDF con texto.'
    );
  }

  const centros = construirColumnas(filas);
  const grid = filas.map((f) => filaAGrilla(f, centros));
  return parseGrid(grid);
}
