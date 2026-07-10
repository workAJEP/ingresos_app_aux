// POST /api/print/stickers
// Arma los stickers de rollos y encola el trabajo de impresión. La PC de la
// impresora lo baja por /api/print/jobs (poller) y lo imprime con BarTender.
//
// Body: {
//   rolloIds:  [<int>],      // ids de distefano.importacion.rollo, y/o
//   barcodes:  ["T2741672"], // códigos de rollo, o
//   importacionId: <int>,    // MASIVA: todos los rollos del expediente
//   departamento: <string>,  // REQUERIDO: lo selecciona el usuario
// }
// proveedor se resuelve del expediente (partner_origen_id) de cada rollo.
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions } from '@/lib/session';
import { respond, badRequest, fail, failOdoo } from '@/lib/http';
import { buildRolloRows } from '@/lib/stickers';
import { odooSearchRead } from '@/lib/odoo';
import { enqueueJob, queueEnabled } from '@/lib/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ROLLOS = 500;

export async function POST(req) {
  const session = await getIronSession(cookies(), sessionOptions);

  let body;
  try {
    body = await req.json();
  } catch {
    return badRequest('Body inválido (se esperaba JSON).');
  }

  const rolloIds = Array.isArray(body.rolloIds) ? body.rolloIds.map(Number).filter(Boolean) : [];
  const barcodes = Array.isArray(body.barcodes)
    ? body.barcodes.map((b) => String(b || '').toUpperCase().replace(/[\r\n\t\s]+/g, '')).filter(Boolean)
    : [];
  const importacionId = Number(body.importacionId) || 0;

  // Departamento: columna del sticker, la elige el usuario al imprimir.
  const departamento = String(body.departamento || '').trim();
  if (!departamento) return badRequest('departamento es requerido (lo selecciona el usuario).');

  if (!rolloIds.length && !barcodes.length && !importacionId) {
    return badRequest('Indica rolloIds, barcodes o importacionId (al menos un rollo).');
  }
  if (rolloIds.length + barcodes.length > MAX_ROLLOS) {
    return badRequest(`Máximo ${MAX_ROLLOS} rollos por impresión.`);
  }

  try {
    // Rollos desde Odoo: por expediente completo (masiva) o por id/barcode.
    const domain = [];
    if (importacionId) {
      domain.push(['importacion_id', '=', importacionId]);
    } else if (rolloIds.length && barcodes.length) {
      domain.push('|', ['id', 'in', rolloIds], ['barcode', 'in', barcodes]);
    } else if (rolloIds.length) {
      domain.push(['id', 'in', rolloIds]);
    } else {
      domain.push(['barcode', 'in', barcodes]);
    }
    const rollos = await odooSearchRead(
      'distefano.importacion.rollo',
      domain,
      ['id', 'barcode', 'nombre', 'color', 'composicion', 'pieza', 'cod_dist', 'peso_neto', 'yardas', 'importacion_id'],
      MAX_ROLLOS,
    );
    if (!rollos.length) {
      return respond({ status: 'error', msg: 'No se encontraron rollos con esos ids/códigos.', detalles: null });
    }

    // proveedor por expediente: partner_origen_id[1] de cada importación.
    const impIds = [
      ...new Set(
        rollos.map((r) => (Array.isArray(r.importacion_id) ? r.importacion_id[0] : r.importacion_id)).filter(Boolean),
      ),
    ];
    const proveedorPorImp = {};
    if (impIds.length) {
      const imps = await odooSearchRead(
        'distefano.importacion',
        [['id', 'in', impIds]],
        ['id', 'partner_origen_id'],
        impIds.length,
      );
      for (const imp of imps) {
        proveedorPorImp[imp.id] = Array.isArray(imp.partner_origen_id) ? imp.partner_origen_id[1] : '';
      }
    }

    // conteo = "pieza / totalArticulo": total de rollos del mismo cod_dist en
    // el mismo expediente (una consulta por par expediente+artículo).
    const totalPorArt = {};
    for (const r of rollos) {
      const impId = Array.isArray(r.importacion_id) ? r.importacion_id[0] : r.importacion_id;
      const clave = `${impId}|${r.cod_dist || ''}`;
      if (!(clave in totalPorArt)) {
        const delArt = await odooSearchRead(
          'distefano.importacion.rollo',
          [['importacion_id', '=', impId], ['cod_dist', '=', r.cod_dist || '']],
          ['id'],
          2000,
        );
        totalPorArt[clave] = delArt.length;
      }
    }

    const rows = rollos.map((r) => {
      const impId = Array.isArray(r.importacion_id) ? r.importacion_id[0] : r.importacion_id;
      const total = totalPorArt[`${impId}|${r.cod_dist || ''}`] || 0;
      const conteo = r.pieza ? `${r.pieza} / ${total}` : `${total}`;
      return buildRolloRows([r], { proveedor: proveedorPorImp[impId] || '', conteo, departamento })[0];
    });

    // Solo informativo: barcodes pedidos que no existen.
    const encontrados = new Set(rollos.map((r) => String(r.barcode)));
    const noEncontrados = barcodes.filter((b) => !encontrados.has(b));

    if (!queueEnabled()) {
      return respond(
        { status: 'error', msg: 'Cola de impresión no configurada. Falta conectar KV (Upstash) en Vercel.', detalles: null },
        500,
      );
    }

    await enqueueJob({
      rows,
      meta: { by: session.login || null, departamento, rollos: rows.length },
      ts: Date.now(),
    });

    return respond({
      status: 'success',
      msg: `Enviado a imprimir: ${rows.length} etiqueta(s) [${departamento}].`,
      detalles: { stickers: rows.length, departamento, noEncontrados },
    });
  } catch (err) {
    if (err && /ECONNREFUSED|ETIMEDOUT|timeout|ENOTFOUND/i.test(String(err.message || err))) return failOdoo(err);
    return fail(err);
  }
}
