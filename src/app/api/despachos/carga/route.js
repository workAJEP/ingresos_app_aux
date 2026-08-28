// POST /api/despachos/carga  { barcode }
//
// Integración con la app de DESPACHOS: al escanear un rollo en modo
// "Ingresar y trasladar", crea (o reusa) en Despachos una CARGA con ubicación
// Z.14 -> Xenacluster (rollos) enlazada al EXPEDIENTE del rollo — ese enlace
// es lo que hace que la carga acepte los QR especiales de los rollos.
//
// La conexión sale de Configuración: api_url_externa + api_key_externa (la
// llave dsp_… la genera el panel de Despachos). Server-side siempre: la key
// nunca viaja al navegador.
import { odooSearchRead } from '@/lib/odoo';
import { configDisponible, getConfig } from '@/lib/config';
import { respond, badRequest, fail } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ubicaciones de la carga que crea esta integración.
const SALIDA = 'Z.14';
const DESTINO = 'Xenacluster (rollos)';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return badRequest('Body inválido (se esperaba JSON).');
  }
  const barcode = String(body.barcode || '').trim().toUpperCase();
  if (!barcode) return badRequest('barcode es requerido.');

  try {
    if (!configDisponible()) {
      return respond({ status: 'info', msg: 'Conexión con Despachos no configurada (sin BD de config).', detalles: null });
    }
    const [key, url] = await Promise.all([getConfig('api_key_externa'), getConfig('api_url_externa')]);
    if (!key?.valor || !url?.valor) {
      return respond({
        status: 'info',
        msg: 'Conexión con Despachos sin configurar: falta URL o API key en Configuración.',
        detalles: null,
      });
    }

    // Expediente del rollo escaneado.
    const rollos = await odooSearchRead(
      'distefano.importacion.rollo',
      [['barcode', '=', barcode]],
      ['id', 'importacion_id'],
      1,
    );
    const impId = rollos[0] && (Array.isArray(rollos[0].importacion_id) ? rollos[0].importacion_id[0] : rollos[0].importacion_id);
    if (!impId) {
      return respond({ status: 'warning', msg: `No se encontró el expediente del rollo ${barcode}.`, detalles: null });
    }

    // Crear/reusar la carga en Despachos (idempotente por expediente).
    let res;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      res = await fetch(`${url.valor.replace(/\/+$/, '')}/api/ext/cargas`, {
        method: 'POST',
        headers: { 'X-API-Key': key.valor, 'Content-Type': 'application/json' },
        body: JSON.stringify({ importacion_id: impId, salida: SALIDA, destino: DESTINO }),
        cache: 'no-store',
        signal: ctrl.signal,
      });
      clearTimeout(t);
    } catch (e) {
      return respond({ status: 'warning', msg: 'Despachos no respondió: la carga NO se creó (el ingreso sí quedó).', detalles: null });
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      /* no-JSON */
    }
    if (res.status === 401) {
      return respond({ status: 'warning', msg: 'Despachos rechazó la API key (revócala/crea otra en su panel).', detalles: null });
    }
    if (!res.ok || !data?.ok) {
      return respond({
        status: 'warning',
        msg: `Despachos respondió ${res.status}: ${data?.error || 'no se pudo crear la carga.'}`,
        detalles: null,
      });
    }

    return respond({
      status: 'success',
      msg: data.reutilizada
        ? `Carga ${data.name} (ya abierta) del expediente ${data.importacion?.name || impId}.`
        : `Carga ${data.name} creada en Despachos (${SALIDA} → ${DESTINO}) para ${data.importacion?.name || impId}.`,
      detalles: { id: data.id, name: data.name, reutilizada: !!data.reutilizada, importacion: data.importacion },
    });
  } catch (err) {
    return fail(err);
  }
}
