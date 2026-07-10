// GET /api/odoo/historial?barcode=&importacionId=&limit= — search_read de
// distefano.importacion.rollo.evento.
//
// Decisión: si viene `barcode`, en vez de pedirle al domain que atraviese la
// relación (rollo_id.barcode — soportado por Odoo real pero no trivial de
// emular igual en fakeOdoo), resolvemos primero el rollo_id con una consulta
// directa y filtramos eventos por ese id. Funciona igual en real y en fake.
import { odooSearchRead } from '@/lib/odoo';
import { respond, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const barcode = (searchParams.get('barcode') || '').trim().toUpperCase();
    const importacionId = searchParams.get('importacionId');
    const limitParam = Number(searchParams.get('limit'));
    const limit = limitParam > 0 ? Math.min(limitParam, 500) : 100;

    const domain = [];
    if (importacionId) domain.push(['importacion_id', '=', Number(importacionId)]);

    if (barcode) {
      const rollosEncontrados = await odooSearchRead(
        'distefano.importacion.rollo',
        [['barcode', '=', barcode]],
        ['id'],
        1,
      );
      if (!rollosEncontrados.length) {
        return respond({ status: 'success', msg: '', detalles: { eventos: [] } });
      }
      domain.push(['rollo_id', '=', rollosEncontrados[0].id]);
    }

    const eventos = await odooSearchRead(
      'distefano.importacion.rollo.evento',
      domain,
      ['rollo_id', 'importacion_id', 'fase', 'estado_origen', 'estado_destino', 'source', 'operador', 'fecha'],
      limit,
      0,
      'fecha desc',
    );

    return respond({ status: 'success', msg: '', detalles: { eventos } });
  } catch (err) {
    return failOdoo(err);
  }
}
