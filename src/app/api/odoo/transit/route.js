// GET /api/odoo/transit?importacionId= — passthrough lista_transito.
import { listaTransito } from '@/lib/rollos';
import { respond, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const importacionId = searchParams.get('importacionId');

  try {
    const res = await listaTransito(importacionId ? Number(importacionId) : null);
    return respond(res);
  } catch (err) {
    return failOdoo(err);
  }
}
