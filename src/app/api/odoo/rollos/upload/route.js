// POST /api/odoo/rollos/upload — multipart: file + importacionId + operador.
// parseExcel (packing list) -> cargar_rollos en chunks de 500.
import { parseExcel } from '@/lib/parseExcel';
import { cargarRollos } from '@/lib/rollos';
import { respond, badRequest, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const EXTENSIONES_PERMITIDAS = ['.xlsx', '.xls', '.csv'];

export async function POST(req) {
  let form;
  try {
    form = await req.formData();
  } catch {
    return badRequest('No se pudo leer el formulario (multipart/form-data).');
  }

  const file = form.get('file');
  const importacionId = Number(form.get('importacionId'));
  const operador = String(form.get('operador') || '').trim() || null;

  if (!file || typeof file === 'string') {
    return badRequest('Debes adjuntar un archivo (.xlsx, .xls o .csv).');
  }
  if (!importacionId) {
    return badRequest('importacionId es requerido.');
  }

  const nombre = file.name || '';
  const punto = nombre.lastIndexOf('.');
  const ext = punto >= 0 ? nombre.slice(punto).toLowerCase() : '';
  if (!EXTENSIONES_PERMITIDAS.includes(ext)) {
    return badRequest('Formato no soportado. Usa .xlsx, .xls o .csv.');
  }
  if (file.size > MAX_SIZE_BYTES) {
    return badRequest('El archivo supera el límite de 10MB.');
  }

  let parsed;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    parsed = parseExcel(buffer);
  } catch (err) {
    console.error('[upload/parseExcel]', err instanceof Error ? err.message : err);
    return badRequest('No se pudo leer el archivo. Verifica que sea un Excel/CSV válido con el formato esperado.');
  }

  const { rows, totalFilas, descartadasSinBarcode, duplicadasEnArchivo } = parsed;

  if (!rows.length) {
    return respond({
      status: 'warning',
      msg: 'El archivo no tiene filas válidas con código de barras.',
      detalles: { creados: 0, yaExistentes: [], totalFilas, descartadasSinBarcode, duplicadasEnArchivo, totalRecibidas: 0 },
    });
  }

  try {
    const { creados, yaExistentes, totalRecibidas } = await cargarRollos(importacionId, rows, operador);
    return respond({
      status: 'success',
      msg: `${creados} rollos creados. ${yaExistentes.length} ya existían.`,
      detalles: { creados, yaExistentes, totalFilas, descartadasSinBarcode, duplicadasEnArchivo, totalRecibidas },
    });
  } catch (err) {
    return failOdoo(err);
  }
}
