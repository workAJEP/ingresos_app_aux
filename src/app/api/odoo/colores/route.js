// GET /api/odoo/colores?q=<texto>
// Sugerencias de "Color" para el editor de artículos: no existe un catálogo de
// colores en Odoo (el campo `color` de product.product es el índice de kanban,
// no un nombre), así que se sugieren los valores YA USADOS en rollos anteriores
// (más frecuentes primero) vía read_group. q vacío -> los más usados en general
// (útil para mostrar sugerencias apenas se abre el campo). Fallback siempre
// disponible: el usuario escribe el color libremente.
import { odooKw } from '@/lib/odoo';
import { respond, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMIT = 20;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();

  try {
    const domain = [['color', '!=', false]];
    if (q) domain.push(['color', 'ilike', q]);

    const grupos = await odooKw('distefano.importacion.rollo', 'read_group', [domain, ['color'], ['color']]);

    const colores = (Array.isArray(grupos) ? grupos : [])
      .map((g) => ({ color: g.color, n: g.color_count || g.__count || 0 }))
      .filter((g) => g.color)
      .sort((a, b) => b.n - a.n)
      .slice(0, LIMIT)
      .map((g) => g.color);

    return respond({ status: 'success', msg: '', detalles: { colores } });
  } catch (err) {
    return failOdoo(err);
  }
}
