// POST /api/odoo/rollos/upload — multipart: file + importacionId + operador.
// parseExcel (packing list) -> cargar_rollos en chunks de 500.
import { parseExcel } from '@/lib/parseExcel';
import { parsePdf } from '@/lib/parsePdf';
import { cargarRollos } from '@/lib/rollos';
import { respond, badRequest, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const EXTENSIONES_PERMITIDAS = ['.xlsx', '.xls', '.csv', '.pdf'];

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
    return badRequest('Formato no soportado. Usa .xlsx, .xls, .csv o .pdf.');
  }
  if (file.size > MAX_SIZE_BYTES) {
    return badRequest('El archivo supera el límite de 10MB.');
  }

  let parsed;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    parsed = ext === '.pdf' ? await parsePdf(buffer) : parseExcel(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || '');
    console.error('[upload/parse]', msg || err);
    // Mensajes "de negocio" del parser (p.ej. PDF escaneado) van tal cual al usuario.
    if (msg && /escaneado|extra[íi]ble/i.test(msg)) return badRequest(msg);
    return badRequest(
      'No se pudo leer el archivo. Verifica que sea un packing list válido (.xlsx, .xls, .csv o .pdf).' +
        (msg ? ` [detalle técnico: ${msg.slice(0, 160)}]` : '')
    );
  }

  const { rows, totalFilas, descartadasSinBarcode, duplicadasEnArchivo, meta } = parsed;

  if (!rows.length) {
    return respond({
      status: 'warning',
      msg: 'No se reconocieron rollos con código de barras en el archivo. Verifica que sea el packing list correcto.',
      detalles: { creados: 0, yaExistentes: [], totalFilas, descartadasSinBarcode, duplicadasEnArchivo, totalRecibidas: 0, meta },
    });
  }

  try {
    const { creados, yaExistentes, totalRecibidas } = await cargarRollos(importacionId, rows, operador);
    const art = meta && meta.articulo ? ` · Artículo ${meta.articulo}` : '';
    return respond({
      status: 'success',
      msg: `${creados} rollos creados. ${yaExistentes.length} ya existían.${art}`,
      detalles: { creados, yaExistentes, totalFilas, descartadasSinBarcode, duplicadasEnArchivo, totalRecibidas, meta },
    });
  } catch (err) {
    return failOdoo(err);
  }
}
