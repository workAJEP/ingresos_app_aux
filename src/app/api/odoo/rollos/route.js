// DELETE /api/odoo/rollos?importacionId=<id>
//
// Elimina TODOS los rollos cargados al expediente (y sus eventos de
// trazabilidad), dejándolo como recién creado — el estado inicial antes de la
// subida del packing list, sin modificaciones. Después se puede volver a
// cargar el packing limpio.
//
// Es DESTRUCTIVO e irreversible: el front pide confirmación explícita.
import { odooSearchRead, odooKw } from '@/lib/odoo';
import { respond, badRequest, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX = 10000;

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const importacionId = Number(searchParams.get('importacionId')) || 0;
  if (!importacionId) return badRequest('importacionId es requerido.');

  try {
    const rollos = await odooSearchRead(
      'distefano.importacion.rollo',
      [['importacion_id', '=', importacionId]],
      ['id'],
      MAX,
    );
    if (!rollos.length) {
      return respond({ status: 'info', msg: 'El expediente no tiene rollos cargados.', detalles: { eliminados: 0 } });
    }

    // Primero los eventos (referencian rollo_id), luego los rollos.
    try {
      const eventos = await odooSearchRead(
        'distefano.importacion.rollo.evento',
        [['importacion_id', '=', importacionId]],
        ['id'],
        MAX * 4,
      );
      if (eventos.length) {
        await odooKw('distefano.importacion.rollo.evento', 'unlink', [eventos.map((e) => e.id)]);
      }
    } catch (e) {
      // Si el modelo de eventos no existe/está vacío, seguimos con los rollos.
      console.error('[rollos/delete eventos]', e instanceof Error ? e.message : e);
    }

    await odooKw('distefano.importacion.rollo', 'unlink', [rollos.map((r) => r.id)]);

    return respond({
      status: 'success',
      msg: `Se eliminaron ${rollos.length} rollo(s) del expediente. Ya puedes volver a cargar el packing list.`,
      detalles: { eliminados: rollos.length },
    });
  } catch (err) {
    return failOdoo(err);
  }
}
