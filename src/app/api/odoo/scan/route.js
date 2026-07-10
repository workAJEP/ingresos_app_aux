// POST /api/odoo/scan — { barcode, fase, operador, source } -> passthrough
// scan_<fase> (ingreso|piloto|xena).
import { scan } from '@/lib/rollos';
import { respond, badRequest, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FASES = ['ingreso', 'piloto', 'xena'];

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return badRequest('Body inválido (se esperaba JSON).');
  }

  const barcode = String(body.barcode || '').trim();
  const fase = String(body.fase || '').trim();
  const operador = body.operador ? String(body.operador).trim() : null;
  const source = body.source ? String(body.source).trim() : 'manual';

  if (!barcode) return badRequest('barcode es requerido.');
  if (!FASES.includes(fase)) return badRequest('fase debe ser ingreso, piloto o xena.');

  try {
    const res = await scan(fase, barcode, operador, source);
    return respond(res);
  } catch (err) {
    return failOdoo(err);
  }
}
