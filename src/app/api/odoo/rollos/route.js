// Administración de los rollos de un expediente.
//
// GET    /api/odoo/rollos?importacionId=<id>
//   -> lista TODOS los rollos del expediente (incluye pendientes) para el
//      modal "Administrar rollos": id, barcode, pieza, nombre, color, estado.
//
// DELETE /api/odoo/rollos?importacionId=<id>[&ids=1,2,3]
//   -> sin `ids`: elimina TODOS los rollos del expediente (y sus eventos),
//      dejándolo como recién creado (estado inicial antes de la subida).
//   -> con `ids`: elimina SOLO esos rollos (y sus eventos). Para cuando un
//      bulto se eliminó a mano y el rollo quedó huérfano/desincronizado.
//
// Es DESTRUCTIVO e irreversible: el front pide confirmación explícita.
import { odooSearchRead, odooKw } from '@/lib/odoo';
import { respond, badRequest, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX = 10000;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const importacionId = Number(searchParams.get('importacionId')) || 0;
  if (!importacionId) return badRequest('importacionId es requerido.');

  try {
    const rollos = await odooSearchRead(
      'distefano.importacion.rollo',
      [['importacion_id', '=', importacionId]],
      ['id', 'barcode', 'pieza', 'nombre', 'color', 'estado'],
      MAX,
      0,
      'id asc',
    );
    return respond({ status: 'success', msg: '', detalles: { rollos } });
  } catch (err) {
    return failOdoo(err);
  }
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const importacionId = Number(searchParams.get('importacionId')) || 0;
  if (!importacionId) return badRequest('importacionId es requerido.');

  // ids opcionales: borrar solo esos rollos (validados contra el expediente).
  const idsParam = String(searchParams.get('ids') || '').trim();
  const idsPedidos = idsParam
    ? [...new Set(idsParam.split(',').map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0))]
    : [];

  try {
    const domain = [['importacion_id', '=', importacionId]];
    if (idsPedidos.length) domain.push(['id', 'in', idsPedidos]);

    const rollos = await odooSearchRead('distefano.importacion.rollo', domain, ['id'], MAX);
    if (!rollos.length) {
      return respond({
        status: 'info',
        msg: idsPedidos.length
          ? 'Ninguno de los rollos indicados pertenece a este expediente.'
          : 'El expediente no tiene rollos cargados.',
        detalles: { eliminados: 0 },
      });
    }
    const rolloIds = rollos.map((r) => r.id);

    // Primero los eventos (referencian rollo_id), luego los rollos.
    try {
      const domEventos = idsPedidos.length
        ? [['rollo_id', 'in', rolloIds]]
        : [['importacion_id', '=', importacionId]];
      const eventos = await odooSearchRead('distefano.importacion.rollo.evento', domEventos, ['id'], MAX * 4);
      if (eventos.length) {
        await odooKw('distefano.importacion.rollo.evento', 'unlink', [eventos.map((e) => e.id)]);
      }
    } catch (e) {
      // Si el modelo de eventos no existe/está vacío, seguimos con los rollos.
      console.error('[rollos/delete eventos]', e instanceof Error ? e.message : e);
    }

    await odooKw('distefano.importacion.rollo', 'unlink', [rolloIds]);

    return respond({
      status: 'success',
      msg: idsPedidos.length
        ? `Se eliminaron ${rolloIds.length} rollo(s) seleccionados.`
        : `Se eliminaron ${rolloIds.length} rollo(s) del expediente. Ya puedes volver a cargar el packing list.`,
      detalles: { eliminados: rolloIds.length },
    });
  } catch (err) {
    return failOdoo(err);
  }
}
