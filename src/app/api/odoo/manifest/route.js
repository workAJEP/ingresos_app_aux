// GET /api/odoo/manifest
//   ?importacionId=  -> manifiesto del EXPEDIENTE: todos los rollos VERIFICADOS
//                       (estado != pendiente) con totales. Es el modo principal
//                       (el flujo es solo Ingreso Z14; al completar la recepción
//                       del contenedor se genera este manifiesto).
//   ?fecha=          -> modo legado por fecha de tránsito (manifiesto_data).
import { manifiestoData } from '@/lib/rollos';
import { odooSearchRead } from '@/lib/odoo';
import { respond, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const num = (v) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
const f2 = (n) => (Math.round(n * 100) / 100).toFixed(2);

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get('fecha');
  const importacionId = Number(searchParams.get('importacionId')) || 0;

  try {
    if (importacionId) {
      const rollos = await odooSearchRead(
        'distefano.importacion.rollo',
        [['importacion_id', '=', importacionId], ['estado', '!=', 'pendiente']],
        ['pieza', 'cod_dist', 'nombre', 'color', 'composicion', 'barcode', 'peso_neto', 'metros', 'yardas', 'importacion_id'],
        2000,
      );
      if (!rollos.length) {
        return respond({
          status: 'info',
          msg: 'Este expediente no tiene rollos verificados todavía.',
          detalles: null,
        });
      }
      const expediente = Array.isArray(rollos[0].importacion_id) ? rollos[0].importacion_id[1] : '';
      let peso = 0;
      let metros = 0;
      let yardas = 0;
      const rows = rollos.map((r) => {
        peso += num(r.peso_neto);
        metros += num(r.metros);
        yardas += num(r.yardas);
        return {
          pieza: r.pieza || '',
          codigoDist: r.cod_dist || '',
          nombre: r.nombre || '',
          color: r.color || '',
          composicion: r.composicion || '',
          codigo: r.barcode,
          pesoNeto: f2(num(r.peso_neto)),
          metros: f2(num(r.metros)),
          yardas: f2(num(r.yardas)),
        };
      });
      return respond({
        status: 'success',
        msg: '',
        detalles: {
          expediente,
          rows,
          totales: { rollos: rows.length, peso: f2(peso), metros: f2(metros), yardas: f2(yardas) },
        },
      });
    }

    const res = await manifiestoData(fecha || null);
    return respond(res);
  } catch (err) {
    return failOdoo(err);
  }
}
