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
  // Reparto en varias cargas: `nueva` fuerza abrir otra; `maxRollos` corta la
  // carga al llegar al tope (Despachos abre la siguiente solo).
  const nueva = body.nueva === true;
  const maxRollos = Math.max(0, Number(body.maxRollos) || 0);

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

    // Crear/reusar la carga en Despachos Y asignarle el rollo (crea su bulto).
    let res;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      res = await fetch(`${url.valor.replace(/\/+$/, '')}/api/ext/cargas`, {
        method: 'POST',
        headers: { 'X-API-Key': key.valor, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importacion_id: impId,
          codigo: barcode,
          salida: SALIDA,
          destino: DESTINO,
          nueva,
          max_rollos: maxRollos || undefined,
        }),
        cache: 'no-store',
        signal: ctrl.signal,
      });
      clearTimeout(t);
    } catch (e) {
      return respond({ status: 'warning', msg: 'Despachos no respondió: el rollo NO quedó en carga (el ingreso sí).', detalles: null });
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

    const partes = [
      data.reutilizada
        ? `Carga ${data.name} (abierta)`
        : `Carga ${data.name} CREADA (${SALIDA} → ${DESTINO})`,
    ];
    if (data.rollo) {
      partes.push(
        data.nuevo
          ? `rollo asignado${data.bulto?.name ? ` como bulto ${data.bulto.name}` : ''}`
          : 'el rollo ya estaba en esta carga',
      );
    }
    if (data.rollos_en_carga != null) {
      partes.push(`${data.rollos_en_carga}${maxRollos ? `/${maxRollos}` : ''} rollos en la carga`);
    }
    return respond({
      status: 'success',
      msg: `${partes.join(' · ')} — ${data.importacion?.name || impId}.`,
      detalles: {
        id: data.id,
        name: data.name,
        reutilizada: !!data.reutilizada,
        importacion: data.importacion,
        rollo: data.rollo,
        bulto: data.bulto,
        rollosEnCarga: data.rollos_en_carga ?? null,
      },
    });
  } catch (err) {
    return fail(err);
  }
}
