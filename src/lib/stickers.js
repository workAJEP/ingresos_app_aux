// Formato de etiqueta de ROLLO (sticker) y serialización a CSV para BarTender.
//
// Mapeo confirmado (fuente → campo del sticker):
//   proveedor    ← importación partner_origen_id[1]
//   composicion  ← rollo.composicion
//   nombre       ← rollo.nombre (tela)
//   codigo       ← rollo.barcode
//   color        ← rollo.color
//   conteo       ← "pieza / totalArticulo" del rollo dentro del expediente
//   Roll No      ← rollo.barcode (= codigo)
//   Net Weight   ← rollo.peso_neto
//   Yards        ← rollo.yardas
//   Departamento ← lo SELECCIONA EL USUARIO al imprimir (no es fijo)
//
// docs/poll-agent.py debe usar LAS MISMAS columnas (mismo orden y cabeceras).

// Columnas del CSV temporal de impresión, EXACTAS y en el orden de
// `docs/Recepcion MP.xlsx` (Hoja1 = encabezados). `header` es el texto LITERAL
// que mapea la plantilla .btw de BarTender; `key` es el campo en las filas JSON.
export const CSV_FIELDS = [
  { key: 'hoja', header: 'Hoja' },
  { key: 'proveedor', header: 'Proveedor' },
  { key: 'composicion', header: 'Composición' },
  { key: 'nombre', header: 'Nombre' },
  { key: 'codigo', header: 'Código' },
  { key: 'color', header: 'Color' },
  { key: 'conteo', header: 'Conteo' },
  { key: 'rollno', header: 'Roll No' },
  { key: 'netweight', header: 'Net Weight' },
  { key: 'yards', header: 'Yards' },
  { key: 'departamento', header: 'Departamento' },
  { key: 'idunico', header: 'ID Unico' },
  { key: 'rollonum', header: 'Rollo #' },
];
export const CSV_HEADER = CSV_FIELDS.map((f) => f.header).join(',');

function num(v, dec) {
  const n = Number(v);
  return isNaN(n) ? (0).toFixed(dec) : n.toFixed(dec);
}
// Net Weight con 3 decimales y Yards con 2, como en docs/Recepcion MP.xlsx
// (ej. 52.497 kg / 100.60 yds).
const numPeso = (v) => num(v, 3);
const numYardas = (v) => num(v, 2);

// Normaliza un rollo (registro Odoo `distefano.importacion.rollo`) a fila de
// sticker, con el mapeo de `docs/Recepcion MP.xlsx`:
//   Hoja        correlativo dentro de la impresión (1..N)
//   Proveedor   partner_origen_id del expediente
//   Composición rollo.composicion
//   Nombre      rollo.nombre (tela / artículo del proveedor)
//   Código      rollo.cod_dist (código del artículo)
//   Color       rollo.color
//   Conteo      "pieza / totalArticulo" (lo calcula el caller)
//   Roll No     rollo.barcode
//   Net Weight  rollo.peso_neto
//   Yards       rollo.yardas
//   Departamento  LO ESTABLECE EL USUARIO al imprimir
//   ID Unico    rollo.barcode (el valor escaneable, igual que Roll No)
//   Rollo #     rollo.id de Odoo (1:1 con la fila del packing list)
export function filaRollo(rollo, { proveedor = '', conteo = '', departamento = '', hoja = '' } = {}) {
  const barcode = String(rollo.barcode || '').trim();
  return {
    hoja: String(hoja || ''),
    proveedor,
    composicion: rollo.composicion || '',
    nombre: rollo.nombre || '',
    codigo: rollo.cod_dist || '',
    color: rollo.color || '',
    conteo,
    rollno: barcode,
    netweight: numPeso(rollo.peso_neto),
    yards: numYardas(rollo.yardas),
    departamento,
    idunico: barcode,
    rollonum: String(rollo.id || ''),
  };
}

// Arma todas las filas de una impresión (1 etiqueta por rollo). `hoja` es el
// correlativo dentro del lote impreso.
export function buildRolloRows(rollos, ctx) {
  return (rollos || []).map((r, i) => filaRollo(r, { ...ctx, hoja: i + 1 }));
}

// --- CSV ---------------------------------------------------------------
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows) {
  const lines = [CSV_HEADER];
  for (const r of rows) lines.push(CSV_FIELDS.map((f) => csvCell(r[f.key])).join(','));
  return lines.join('\r\n');
}

// --- Fallback por navegador -------------------------------------------
// Etiqueta 50×30 mm si no hay BarTender (el diseño real vive en el .btw).
export function renderFallbackHTML(rows) {
  const etiquetas = rows
    .map(
      (r) => `
      <div class="sticker">
        <div class="id">${r.codigo}</div>
        <div class="meta">${r.nombre}</div>
        <div class="meta">${r.composicion}</div>
        <div class="meta">${r.color} · ${r.conteo} · ${r.netweight} kg · ${r.yards} yds</div>
        <div class="dep">${r.departamento} · ${r.proveedor}</div>
      </div>`,
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title>
  <style>
    @page { size: 50mm 30mm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; }
    .sticker { width: 50mm; height: 30mm; padding: 2mm; page-break-after: always;
               display: flex; flex-direction: column; justify-content: space-between; }
    .id   { font-size: 13pt; font-weight: 700; font-family: monospace; }
    .meta { font-size: 7.5pt; }
    .dep  { font-size: 6.5pt; color: #555; }
  </style></head><body onload="print()">${etiquetas}</body></html>`;
}
