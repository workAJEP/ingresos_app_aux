// GET /api/odoo/reporte?importacionId=&estado= — rollos YA ESCANEADOS
// (estado != pendiente) con toda su información: datos del rollo, expediente,
// proveedor, fecha/operador de cada fase y totales (peso/metros/yardas).
// `estado` opcional (bodega|transito|recibido) restringe a una sola fase.
import { odooSearchRead } from '@/lib/odoo';
import { respond, badRequest, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ESTADOS_ESCANEADOS = ['bodega', 'transito', 'recibido'];
const MAX_ROLLOS = 5000;

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const importacionId = searchParams.get('importacionId');
    const estado = (searchParams.get('estado') || '').trim();

    if (estado && !ESTADOS_ESCANEADOS.includes(estado)) {
      return badRequest('estado debe ser bodega, transito o recibido.');
    }

    const domain = estado ? [['estado', '=', estado]] : [['estado', '!=', 'pendiente']];
    if (importacionId) domain.push(['importacion_id', '=', Number(importacionId)]);

    const rollos = await odooSearchRead(
      'distefano.importacion.rollo',
      domain,
      [
        'barcode', 'pieza', 'cod_dist', 'nombre', 'color', 'composicion',
        'peso_neto', 'metros', 'yardas', 'estado', 'importacion_id',
        'fecha_z14', 'fecha_piloto', 'fecha_xena',
        'operador_z14', 'operador_piloto', 'operador_xena',
      ],
      MAX_ROLLOS,
      0,
      'fecha_z14 desc',
    );

    // Proveedor por expediente (partner_origen_id), una sola consulta.
    const impIds = [
      ...new Set(
        rollos
          .map((r) => (Array.isArray(r.importacion_id) ? r.importacion_id[0] : r.importacion_id))
          .filter(Boolean),
      ),
    ];
    let proveedorPorImp = {};
    if (impIds.length) {
      const imps = await odooSearchRead(
        'distefano.importacion',
        [['id', 'in', impIds]],
        ['partner_origen_id'],
        impIds.length,
      );
      proveedorPorImp = Object.fromEntries(
        imps.map((i) => [i.id, Array.isArray(i.partner_origen_id) ? i.partner_origen_id[1] : '']),
      );
    }

    const fmt2 = (n) => (Number(n) || 0).toFixed(2);
    let peso = 0;
    let metros = 0;
    let yardas = 0;
    const porEstado = { bodega: 0, transito: 0, recibido: 0 };

    const rows = rollos.map((r) => {
      peso += Number(r.peso_neto) || 0;
      metros += Number(r.metros) || 0;
      yardas += Number(r.yardas) || 0;
      if (porEstado[r.estado] !== undefined) porEstado[r.estado] += 1;
      const impId = Array.isArray(r.importacion_id) ? r.importacion_id[0] : r.importacion_id;
      return {
        id: r.id,
        codigo: r.barcode || '',
        pieza: r.pieza || '',
        codigoDist: r.cod_dist || '',
        nombre: r.nombre || '',
        color: r.color || '',
        composicion: r.composicion || '',
        pesoNeto: fmt2(r.peso_neto),
        metros: fmt2(r.metros),
        yardas: fmt2(r.yardas),
        estado: r.estado,
        expediente: Array.isArray(r.importacion_id) ? r.importacion_id[1] : '',
        proveedor: proveedorPorImp[impId] || '',
        fechaZ14: r.fecha_z14 || '',
        fechaPiloto: r.fecha_piloto || '',
        fechaXena: r.fecha_xena || '',
        operadorZ14: r.operador_z14 || '',
        operadorPiloto: r.operador_piloto || '',
        operadorXena: r.operador_xena || '',
      };
    });

    return respond({
      status: 'success',
      msg: '',
      detalles: {
        rows,
        totales: {
          rollos: rows.length,
          peso: fmt2(peso),
          metros: fmt2(metros),
          yardas: fmt2(yardas),
          porEstado,
        },
        truncado: rollos.length >= MAX_ROLLOS,
      },
    });
  } catch (err) {
    return failOdoo(err);
  }
}
