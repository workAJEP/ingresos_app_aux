// GET /api/odoo/colores?q=<texto>
// Sugerencias de "Color" LEGIBLE para el editor de artículos.
//
// La fuente es el catálogo de colores de Distefano: `distefano.dharma.color.especifico`,
// cuyos nombres vienen como "Azul Obscuro: Regular" / "Azul Obscuro: Short" — se
// recorta el sufijo y se deduplica, quedando el color puro ("Azul Obscuro").
//
// NO se sugieren los colores ya usados en rollos: esos vienen del packing list y
// son CÓDIGOS del proveedor (D1000, 58L, W942), justo lo que la etiqueta NO debe
// llevar. Como respaldo (catálogo vacío / Odoo sin ese modelo) sí se usan los
// colores de rollos, pero filtrando los que parecen código.
import { odooSearchRead, odooKw } from '@/lib/odoo';
import { respond, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMIT = 20;

// ¿Parece código de proveedor (D1000, 58L, W942, 992) en vez de un color legible?
// Un color legible es una palabra alfabética de >= 3 letras.
function esCodigoColor(s) {
  const v = String(s || '').trim();
  if (!v) return true;
  if (/\d/.test(v)) return true;
  return v.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '').length < 3;
}

// "Azul Obscuro: Regular" -> "Azul Obscuro"
function colorBase(name) {
  return String(name || '').split(':')[0].trim();
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();

  try {
    const domain = q ? [['name', 'ilike', q]] : [];
    const registros = await odooSearchRead(
      'distefano.dharma.color.especifico',
      domain,
      ['name'],
      300,
      0,
      'name asc',
    );

    const colores = [...new Set(registros.map((r) => colorBase(r.name)).filter(Boolean))].slice(0, LIMIT);
    if (colores.length) {
      return respond({ status: 'success', msg: '', detalles: { colores } });
    }

    // Respaldo: colores ya usados en rollos, descartando los códigos del proveedor.
    const dom = [['color', '!=', false]];
    if (q) dom.push(['color', 'ilike', q]);
    const grupos = await odooKw('distefano.importacion.rollo', 'read_group', [dom, ['color'], ['color']]);
    const usados = (Array.isArray(grupos) ? grupos : [])
      .map((g) => ({ color: g.color, n: g.color_count || g.__count || 0 }))
      .filter((g) => g.color && !esCodigoColor(g.color))
      .sort((a, b) => b.n - a.n)
      .slice(0, LIMIT)
      .map((g) => g.color);

    return respond({ status: 'success', msg: '', detalles: { colores: usados } });
  } catch (err) {
    return failOdoo(err);
  }
}
