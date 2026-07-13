// GET /api/odoo/productos?q=<texto>
// Sugerencias de "tela" (product.product, categoría Telas) para el editor de
// artículos: busca por Código Interno (default_code) o Nombre. Cada resultado
// trae también la Composición (campo `tipo`, many2one a distefano.product.tipo)
// para autocompletar el formulario al elegir un producto real de Odoo — la
// alternativa a que el usuario escriba todo a mano.
import { odooSearchRead } from '@/lib/odoo';
import { respond, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TELAS_CATEG_ID = Number(process.env.ODOO_TELAS_CATEG_ID || 368);
const MIN_CHARS = 2;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();

  if (q.length < MIN_CHARS) {
    return respond({ status: 'success', msg: '', detalles: { productos: [] } });
  }

  try {
    const productos = await odooSearchRead(
      'product.product',
      [
        ['categ_id', 'child_of', TELAS_CATEG_ID],
        '|',
        ['default_code', 'ilike', q],
        ['name', 'ilike', q],
      ],
      ['id', 'default_code', 'name', 'tipo'],
      20,
    );

    const detalles = productos.map((p) => ({
      id: p.id,
      codigo: p.default_code || '',
      nombre: p.name || '',
      composicion: Array.isArray(p.tipo) ? p.tipo[1] : '',
    }));

    return respond({ status: 'success', msg: '', detalles: { productos: detalles } });
  } catch (err) {
    return failOdoo(err);
  }
}
