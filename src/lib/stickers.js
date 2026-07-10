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

// Columnas CONFIRMADAS del sticker, en este orden. `header` es el texto
// LITERAL de la cabecera del CSV (así los mapea la plantilla .btw de
// BarTender); `key` es el nombre del campo en las filas JSON.
export const CSV_FIELDS = [
  { key: 'proveedor', header: 'proveedor' },
  { key: 'composicion', header: 'composicion' },
  { key: 'nombre', header: 'nombre' },
  { key: 'codigo', header: 'codigo' },
  { key: 'color', header: 'color' },
  { key: 'conteo', header: 'conteo' },
  { key: 'rollno', header: 'Roll No' },
  { key: 'netweight', header: 'Net Weight' },
  { key: 'yards', header: 'Yards' },
  { key: 'departamento', header: 'Departamento' },
];
export const CSV_HEADER = CSV_FIELDS.map((f) => f.header).join(',');

function num2(v) {
  const n = Number(v);
  return isNaN(n) ? '0.00' : n.toFixed(2);
}

// Normaliza un rollo (registro Odoo `distefano.importacion.rollo`) a fila de
// sticker. `proveedor` viene del expediente (partner_origen_id[1]);
// `conteo` = "pieza / totalArticulo" (lo calcula el caller);
// `departamento` lo SELECCIONA EL USUARIO al imprimir.
// codigo y Roll No = barcode del rollo.
export function filaRollo(rollo, { proveedor = '', conteo = '', departamento = '' } = {}) {
  const barcode = String(rollo.barcode || '').trim();
  return {
    proveedor,
    composicion: rollo.composicion || '',
    nombre: rollo.nombre || '',
    codigo: barcode,
    color: rollo.color || '',
    conteo,
    rollno: barcode,
    netweight: num2(rollo.peso_neto),
    yards: num2(rollo.yardas),
    departamento,
  };
}

// Arma todas las filas de una impresión (1 etiqueta por rollo).
export function buildRolloRows(rollos, ctx) {
  return (rollos || []).map((r) => filaRollo(r, ctx));
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
