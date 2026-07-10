// GET /api/odoo/dashboard?importacionId= — passthrough dashboard_data.
import { dashboardData } from '@/lib/rollos';
import { respond, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const importacionId = searchParams.get('importacionId');

  try {
    const res = await dashboardData(importacionId ? Number(importacionId) : null);
    return respond(res);
  } catch (err) {
    return failOdoo(err);
  }
}
