// Apartado Configuración.
//   GET  /api/config -> estado de la impresión (cola) + conexión con la app de
//        Despachos (URL + API key enmascarada, nunca completa).
//   POST /api/config { apiKey?, apiUrl? }       -> guarda key y/o URL.
//   POST /api/config { accion: 'probar' }       -> prueba la conexión llamando
//        <apiUrl>/api/ext/ping con la key guardada (X-API-Key), server-side.
//
// La key la GENERA la app de Despachos (panel admin, prefijo dsp_): aquí solo
// se pega y se administra. Despachos acepta `Authorization: Bearer` o
// `X-API-Key` (ver Despachos_app_aux/src/lib/apiKeyToken.js).
import { queueStatus } from '@/lib/queue';
import { configDisponible, getConfig, setConfig } from '@/lib/config';
import { respond, badRequest, fail } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLAVE_API_KEY = 'api_key_externa';
const CLAVE_API_URL = 'api_url_externa';

// Formato de las llaves de Despachos: dsp_ + 48 hex.
const FORMATO_DSP = /^dsp_[0-9a-f]{48}$/;

// Enmascara la key: solo los últimos 4 caracteres visibles.
function mascara(valor) {
  const s = String(valor || '');
  if (!s) return '';
  return s.length <= 4 ? '••••' : `••••••••${s.slice(-4)}`;
}

function normalizarUrl(url) {
  const s = String(url || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) return null;
    return s;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    let impresion = null;
    try {
      impresion = await queueStatus();
    } catch (e) {
      impresion = { error: 'cola no accesible' };
    }

    const conexion = { disponible: configDisponible(), apiKey: '', apiUrl: '', actualizado: null };
    if (configDisponible()) {
      // Resiliente: si la tabla app_config aún no existe, la página igual
      // carga (y avisa) en vez de tirar 500.
      try {
        const [key, url] = await Promise.all([getConfig(CLAVE_API_KEY), getConfig(CLAVE_API_URL)]);
        if (key) {
          conexion.apiKey = mascara(key.valor);
          conexion.actualizado = key.actualizado_en instanceof Date ? key.actualizado_en.toISOString() : key.actualizado_en;
        }
        if (url) conexion.apiUrl = url.valor;
      } catch (e) {
        console.error('[config GET]', e instanceof Error ? e.message : e);
        conexion.disponible = false;
        conexion.error = 'No se pudo leer app_config (¿falta la tabla en la BD?).';
      }
    }

    return respond({ status: 'success', msg: '', detalles: { impresion, conexion } });
  } catch (err) {
    return fail(err);
  }
}

// Llama al ping de Despachos con la key guardada. Devuelve el veredicto.
async function probarConexion() {
  const [key, url] = await Promise.all([getConfig(CLAVE_API_KEY), getConfig(CLAVE_API_URL)]);
  if (!url?.valor) return { status: 'warning', msg: 'Falta la URL de la app de Despachos. Guárdala primero.' };
  if (!key?.valor) return { status: 'warning', msg: 'Falta la API key. Guárdala primero.' };

  let res;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    res = await fetch(`${url.valor}/api/ext/ping`, {
      headers: { 'X-API-Key': key.valor },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    clearTimeout(t);
  } catch (e) {
    return { status: 'error', msg: `No se pudo alcanzar ${url.valor} (¿URL correcta? ¿app caída?).` };
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta no-JSON */
  }
  if (res.status === 401) return { status: 'error', msg: 'La app respondió 401: llave inválida o revocada.' };
  if (!res.ok || !data?.ok) return { status: 'error', msg: `La app respondió ${res.status} (esperaba ok).` };
  return {
    status: 'success',
    msg: `Conexión OK con "${data.app}"${data.cliente ? ` como "${data.cliente}"` : ''}.`,
    detalles: { app: data.app, cliente: data.cliente, hora: data.hora },
  };
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return badRequest('Body inválido (se esperaba JSON).');
  }

  if (!configDisponible()) {
    return respond(
      { status: 'error', msg: 'Configuración no disponible: falta DATABASE_URL (Postgres) en este entorno.', detalles: null },
      500,
    );
  }

  try {
    if (body.accion === 'probar') {
      const veredicto = await probarConexion();
      return respond({ detalles: null, ...veredicto });
    }

    const apiKey = String(body.apiKey || '').trim();
    const apiUrlCrudo = body.apiUrl !== undefined ? String(body.apiUrl || '') : undefined;
    if (!apiKey && apiUrlCrudo === undefined) return badRequest('Nada que guardar: manda apiKey y/o apiUrl.');

    const avisos = [];
    if (apiKey) {
      if (apiKey.length < 8) return badRequest('La API key parece incompleta (mínimo 8 caracteres).');
      if (!FORMATO_DSP.test(apiKey)) {
        avisos.push('La key no tiene el formato dsp_… de Despachos — se guardó igual, verifica que sea la correcta.');
      }
      await setConfig(CLAVE_API_KEY, apiKey);
    }
    if (apiUrlCrudo !== undefined) {
      const url = normalizarUrl(apiUrlCrudo);
      if (url === null) return badRequest('La URL no es válida (usa https://…).');
      await setConfig(CLAVE_API_URL, url);
    }

    return respond({
      status: avisos.length ? 'warning' : 'success',
      msg: avisos.length ? avisos.join(' ') : 'Conexión guardada. Usa "Probar conexión" para verificarla.',
      detalles: { apiKey: apiKey ? mascara(apiKey) : undefined },
    });
  } catch (err) {
    return fail(err);
  }
}
