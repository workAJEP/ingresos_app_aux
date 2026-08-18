// GET /api/odoo/manifiesto-envio?barcode=&importacionId=
//
// Valida UN rollo escaneado para el manifiesto de envío y devuelve su info.
// Reglas:
//   - El rollo debe existir.
//   - Debe estar INGRESADO (estado != pendiente): solo lo ya escaneado en el
//     ingreso físico es válido para el manifiesto.
//   - Si viene `importacionId`, debe pertenecer a ese expediente.
//
// El yardaje se calcula con la MISMA conversión de los stickers (el campo
// `yardas` de Odoo trae METROS; yardas = metros × 1.09361) para que el listado
// concuerde con lo impreso en las etiquetas.
import { odooSearchRead } from '@/lib/odoo';
import { respond, badRequest, failOdoo } from '@/lib/http';
import { metrosAYardas } from '@/lib/unidades';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const f2 = (v) => {
  const n = Number(v);
  return (isNaN(n) ? 0 : n).toFixed(2);
};

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const barcode = String(searchParams.get('barcode') || '').trim().toUpperCase();
  const importacionId = Number(searchParams.get('importacionId')) || 0;
  if (!barcode) return badRequest('barcode es requerido.');

  try {
    const rollos = await odooSearchRead(
      'distefano.importacion.rollo',
      [['barcode', '=', barcode]],
      ['id', 'barcode', 'pieza', 'cod_dist', 'nombre', 'color', 'composicion', 'peso_neto', 'yardas', 'estado', 'importacion_id'],
      1,
    );
    if (!rollos.length) {
      return respond({ status: 'error', msg: `Rollo ${barcode} no existe en ningún expediente.`, detalles: null });
    }
    const r = rollos[0];
    const impId = Array.isArray(r.importacion_id) ? r.importacion_id[0] : r.importacion_id;
    const expediente = Array.isArray(r.importacion_id) ? r.importacion_id[1] : '';

    if (r.estado === 'pendiente') {
      return respond({
        status: 'warning',
        msg: `Rollo ${barcode} NO está ingresado (pendiente). Escanéalo primero en Ingreso Z14.`,
        detalles: null,
      });
    }
    if (importacionId && impId !== importacionId) {
      return respond({
        status: 'warning',
        msg: `Rollo ${barcode} pertenece a otro expediente (${expediente}).`,
        detalles: null,
      });
    }

    // `yardas` de Odoo trae METROS (así se ingresa el largo del rollo).
    const metros = Number(r.yardas) || 0;
    return respond({
      status: 'success',
      msg: `Rollo ${barcode} agregado al manifiesto.`,
      detalles: {
        rollo: {
          id: r.id,
          codigo: r.barcode,
          pieza: r.pieza || '',
          codigoTela: r.cod_dist || '',
          descripcion: r.nombre || '',
          color: r.color || '',
          composicion: r.composicion || '',
          pesoNeto: f2(r.peso_neto),
          metros: f2(metros),
          yardas: f2(metrosAYardas(metros)), // misma conversión que los stickers
          estado: r.estado,
          importacionId: impId,
          expediente,
        },
      },
    });
  } catch (err) {
    return failOdoo(err);
  }
}
