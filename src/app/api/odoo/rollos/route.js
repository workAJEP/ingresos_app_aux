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
// PATCH  /api/odoo/rollos   { importacionId, ids? }
//   -> REVIERTE los rollos indicados a estado 'pendiente' (limpia fechas y
//      operadores de cada fase), para cuando se escanearon por error.
//
// El DELETE es DESTRUCTIVO e irreversible: el front pide confirmación explícita.
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

// Campos a limpiar al volver a 'pendiente'. Si el modelo de Odoo no tuviera
// alguno, se reintenta escribiendo solo `estado` (el dato clave).
const VALS_PENDIENTE = {
  estado: 'pendiente',
  fecha_z14: false,
  fecha_piloto: false,
  fecha_xena: false,
  operador_z14: false,
  operador_piloto: false,
  operador_xena: false,
};

// PATCH { importacionId, ids? } — revierte rollos a 'pendiente'. El "deshacer"
// del escaneo solo retrocede UN paso y dentro de la sesión; esto devuelve el
// rollo al inicio desde la lista del expediente. Sin `ids`: todos los no
// pendientes del expediente.
export async function PATCH(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return badRequest('Body inválido (se esperaba JSON).');
  }

  const importacionId = Number(body.importacionId) || 0;
  if (!importacionId) return badRequest('importacionId es requerido.');

  const idsPedidos = Array.isArray(body.ids)
    ? [...new Set(body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];

  try {
    // Solo los del expediente y que NO estén ya en pendiente.
    const domain = [
      ['importacion_id', '=', importacionId],
      ['estado', '!=', 'pendiente'],
    ];
    if (idsPedidos.length) domain.push(['id', 'in', idsPedidos]);

    const rollos = await odooSearchRead('distefano.importacion.rollo', domain, ['id'], MAX);
    if (!rollos.length) {
      return respond({
        status: 'info',
        msg: idsPedidos.length
          ? 'Los rollos seleccionados ya están en Pendiente (o no son de este expediente).'
          : 'No hay rollos que revertir: todos están en Pendiente.',
        detalles: { revertidos: 0 },
      });
    }
    const rolloIds = rollos.map((r) => r.id);

    try {
      await odooKw('distefano.importacion.rollo', 'write', [rolloIds, VALS_PENDIENTE]);
    } catch (e) {
      console.error('[rollos/patch write]', e instanceof Error ? e.message : e);
      await odooKw('distefano.importacion.rollo', 'write', [rolloIds, { estado: 'pendiente' }]);
    }

    return respond({
      status: 'success',
      msg: `Se revirtieron ${rolloIds.length} rollo(s) a Pendiente.`,
      detalles: { revertidos: rolloIds.length },
    });
  } catch (err) {
    return failOdoo(err);
  }
}
