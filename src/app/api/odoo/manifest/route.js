// GET /api/odoo/manifest?fecha= — passthrough manifiesto_data (datos; el HTML/impresión lo arma React).
import { manifiestoData } from '@/lib/rollos';
import { respond, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get('fecha');

  try {
    const res = await manifiestoData(fecha || null);
    return respond(res);
  } catch (err) {
    return failOdoo(err);
  }
}
