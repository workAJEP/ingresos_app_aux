// GET /api/health — latencia/estado de Odoo. Shape especial (no el envelope
// {status,msg,detalles} de las demás rutas): {odoo, latencyMs, db}. Es el
// endpoint que golpea el botón "Reintentar" del OdooStatusBanner, así que
// SIEMPRE responde 200 con `odoo:false` en vez de un HTTP de error — así el
// front solo necesita leer un booleano, sin distinguir códigos de estado.
import { NextResponse } from 'next/server';
import { pingOdoo } from '@/lib/odoo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const r = await pingOdoo(4000);
    return NextResponse.json({ odoo: true, latencyMs: r.latencyMs, db: r.db });
  } catch (err) {
    console.error('[health]', err instanceof Error ? err.message : err);
    return NextResponse.json({ odoo: false, latencyMs: null, db: process.env.ODOO_DB || null });
  }
}
