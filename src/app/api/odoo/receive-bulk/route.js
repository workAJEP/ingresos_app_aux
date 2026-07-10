// POST /api/odoo/receive-bulk — { barcodes[], operador } -> passthrough recibir_bulk.
import { recibirBulk } from '@/lib/rollos';
import { respond, badRequest, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return badRequest('Body inválido (se esperaba JSON).');
  }

  const barcodes = Array.isArray(body.barcodes) ? body.barcodes.filter(Boolean) : [];
  const operador = body.operador ? String(body.operador).trim() : null;

  if (!barcodes.length) return badRequest('barcodes es requerido (arreglo no vacío).');

  try {
    const res = await recibirBulk(barcodes, operador);
    return respond(res);
  } catch (err) {
    return failOdoo(err);
  }
}
