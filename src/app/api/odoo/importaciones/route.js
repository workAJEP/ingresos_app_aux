// GET  /api/odoo/importaciones?q=  — lista expedientes abiertos + contadores de rollos.
// POST /api/odoo/importaciones      — crea expediente (y proveedor si no existe).
import { odooSearchRead, odooCreate } from '@/lib/odoo';
import { respond, badRequest, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();

    const domain = [['state', 'not in', ['cerrado', 'cancelado']]];
    if (q) {
      domain.push('|', '|', ['name', 'ilike', q], ['descripcion', 'ilike', q], ['contenedor', 'ilike', q]);
    }

    const importaciones = await odooSearchRead(
      'distefano.importacion',
      domain,
      ['name', 'descripcion', 'partner_origen_id', 'state', 'contenedor'],
      20,
      0,
      'id desc',
    );

    // Contadores por estado: en vez de read_group (formato de la clave de
    // conteo ambiguo entre versiones/ORM viejo de Odoo 8), se trae
    // search_read de los rollos de estos expedientes y se agrega en JS — 1
    // sola llamada RPC adicional, robusta en fake y en real por igual.
    const ids = importaciones.map((i) => i.id);
    let rollos = [];
    if (ids.length) {
      rollos = await odooSearchRead(
        'distefano.importacion.rollo',
        [['importacion_id', 'in', ids]],
        ['importacion_id', 'estado'],
        5000,
      );
    }

    const counts = {};
    for (const r of rollos) {
      const impId = Array.isArray(r.importacion_id) ? r.importacion_id[0] : r.importacion_id;
      if (!counts[impId]) counts[impId] = { total: 0, pendiente: 0, bodega: 0, transito: 0, recibido: 0 };
      counts[impId].total++;
      if (counts[impId][r.estado] !== undefined) counts[impId][r.estado]++;
    }

    const out = importaciones.map((i) => {
      const c = counts[i.id] || { total: 0, pendiente: 0, bodega: 0, transito: 0, recibido: 0 };
      return {
        id: i.id,
        name: i.name,
        descripcion: i.descripcion,
        proveedor: Array.isArray(i.partner_origen_id) ? i.partner_origen_id[1] : '',
        state: i.state,
        contenedor: i.contenedor,
        rollosTotal: c.total,
        rollosPendientes: c.pendiente,
        rollosBodega: c.bodega,
        rollosTransito: c.transito,
        rollosRecibidos: c.recibido,
      };
    });

    return respond({ status: 'success', msg: '', detalles: { importaciones: out } });
  } catch (err) {
    return failOdoo(err);
  }
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return badRequest('Body inválido (se esperaba JSON).');
  }

  const descripcion = String(body.descripcion || '').trim();
  const proveedorNombre = String(body.proveedorNombre || '').trim();
  const contenedor = String(body.contenedor || '').trim();

  if (!descripcion) {
    return badRequest('La descripción del expediente es requerida.');
  }

  try {
    let partnerId = false;
    if (proveedorNombre) {
      const existentes = await odooSearchRead(
        'res.partner',
        [['name', 'ilike', proveedorNombre]],
        ['id', 'name'],
        1,
      );
      partnerId = existentes.length
        ? existentes[0].id
        : await odooCreate('res.partner', { name: proveedorNombre, supplier: true });
    }

    const vals = {
      descripcion,
      origen: 'compra',
      company_id: Number(process.env.ODOO_COMPANY_ID || 1),
    };
    if (partnerId) vals.partner_origen_id = partnerId;
    if (contenedor) vals.contenedor = contenedor;

    const id = await odooCreate('distefano.importacion', vals);
    const recs = await odooSearchRead('distefano.importacion', [['id', '=', id]], ['name'], 1);
    const name = recs[0] ? recs[0].name : '';

    return respond({ status: 'success', msg: `Expediente ${name} creado.`, detalles: { id, name } });
  } catch (err) {
    return failOdoo(err);
  }
}
