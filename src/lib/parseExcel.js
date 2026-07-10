// Parseo del packing list (Excel/CSV) para la carga inicial de rollos.
// Índices de columna EXACTOS del GAS original (test.md): el layout del
// packing list NO cambia con la migración, solo cambia qué hace la app con
// esas columnas (antes escribía a un Sheet; ahora arma `rows` para
// cargar_rollos).
import * as XLSX from 'xlsx';

const COL_PIEZA = 0; // A
const COL_COD_DIST = 1; // B
const COL_NOMBRE = 2; // C
const COL_COLOR = 3; // D
const COL_COMPOSICION = 4; // E
const COL_BARCODE = 10; // K
const COL_PESO_NETO = 13; // N
const COL_METROS = 25; // Z
const COL_YARDAS = 26; // AA

function toNumber(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// Normalización SIN recorte (a diferencia de barcode.js/normalizarBarcode,
// que sí recorta los últimos 2 caracteres al ESCANEAR). El barcode que se
// guarda en el rollo es el valor tal cual viene en el packing list.
function normalizarSinRecorte(raw) {
  return String(raw == null ? '' : raw)
    .toUpperCase()
    .replace(/[\r\n\t\s]+/g, '');
}

// Recibe un Buffer (o ArrayBuffer) del archivo subido. Devuelve
// { rows, totalFilas, descartadasSinBarcode, duplicadasEnArchivo }.
// `rows` trae exactamente los 9 campos que espera cargar_rollos.
export function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  data.shift(); // descarta la fila de cabecera

  const totalFilas = data.length;
  let descartadasSinBarcode = 0;
  let duplicadasEnArchivo = 0;
  const vistos = new Set();
  const rows = [];

  for (const fila of data) {
    const barcode = normalizarSinRecorte(fila[COL_BARCODE]);
    if (!barcode) {
      descartadasSinBarcode++;
      continue;
    }
    if (vistos.has(barcode)) {
      duplicadasEnArchivo++;
      continue;
    }
    vistos.add(barcode);
    rows.push({
      pieza: String(fila[COL_PIEZA] == null ? '' : fila[COL_PIEZA]),
      cod_dist: String(fila[COL_COD_DIST] == null ? '' : fila[COL_COD_DIST]),
      nombre: String(fila[COL_NOMBRE] == null ? '' : fila[COL_NOMBRE]),
      color: String(fila[COL_COLOR] == null ? '' : fila[COL_COLOR]),
      composicion: String(fila[COL_COMPOSICION] == null ? '' : fila[COL_COMPOSICION]),
      barcode,
      peso_neto: toNumber(fila[COL_PESO_NETO]),
      metros: toNumber(fila[COL_METROS]),
      yardas: toNumber(fila[COL_YARDAS]),
    });
  }

  return { rows, totalFilas, descartadasSinBarcode, duplicadasEnArchivo };
}
