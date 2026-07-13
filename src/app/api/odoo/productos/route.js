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
const MIN_CHARS = 1;

// Solo ~1 de cada 10 telas tiene el campo Composición (`tipo`) cargado en
// Odoo, pero el NOMBRE del producto casi siempre la trae embebida
// ("98%C/2%S", "65% Poliester 35%Algodón", "81%C 17%P 2%E"). Extrae del
// nombre los tramos "NN% Fibra" consecutivos como fallback.
function composicionDesdeNombre(nombre) {
  const re = /\d{1,3}\s*%\s*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g;
  const partes = String(nombre || '').match(re) || [];
  return partes.length ? partes.map((p) => p.replace(/\s+/g, ' ').trim()).join(' ') : '';
}

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

    // Muchas telas NO tienen Código Interno en Odoo — se mantienen (el
    // frontend usa el nombre como valor), pero las que sí tienen código van
    // primero: son las que permiten el autocompletado exacto.
    const detalles = productos
      .map((p) => ({
        id: p.id,
        codigo: p.default_code || '',
        nombre: p.name || '',
        composicion: (Array.isArray(p.tipo) ? p.tipo[1] : '') || composicionDesdeNombre(p.name),
      }))
      .sort((a, b) => (b.codigo ? 1 : 0) - (a.codigo ? 1 : 0));

    return respond({ status: 'success', msg: '', detalles: { productos: detalles } });
  } catch (err) {
    return failOdoo(err);
  }
}
