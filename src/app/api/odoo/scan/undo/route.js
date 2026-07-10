// POST /api/odoo/scan/undo — { barcode, estadoEsperado?, operador } -> passthrough scan_undo.
import { scanUndo } from '@/lib/rollos';
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

  const barcode = String(body.barcode || '').trim();
  const operador = body.operador ? String(body.operador).trim() : null;
  const estadoEsperado = body.estadoEsperado ? String(body.estadoEsperado).trim() : null;

  if (!barcode) return badRequest('barcode es requerido.');

  try {
    const res = await scanUndo(barcode, operador, estadoEsperado);
    return respond(res);
  } catch (err) {
    return failOdoo(err);
  }
}
