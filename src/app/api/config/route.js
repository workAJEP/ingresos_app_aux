// Apartado Configuración.
//   GET  /api/config -> estado de la impresión (cola) + conexión (API key
//        enmascarada, nunca completa) para pintar la página.
//   POST /api/config { apiKey } -> guarda la API key de conexión (la genera
//        OTRA app; aquí solo se pega y se administra).
import { queueStatus } from '@/lib/queue';
import { configDisponible, getConfig, setConfig } from '@/lib/config';
import { respond, badRequest, fail } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLAVE_API_KEY = 'api_key_externa';

// Enmascara la key: solo los últimos 4 caracteres visibles.
function mascara(valor) {
  const s = String(valor || '');
  if (!s) return '';
  return s.length <= 4 ? '••••' : `••••••••${s.slice(-4)}`;
}

export async function GET() {
  try {
    let impresion = null;
    try {
      impresion = await queueStatus();
    } catch (e) {
      impresion = { error: 'cola no accesible' };
    }

    let conexion = { disponible: configDisponible(), apiKey: '', actualizado: null };
    if (configDisponible()) {
      const row = await getConfig(CLAVE_API_KEY);
      if (row) {
        conexion.apiKey = mascara(row.valor);
        conexion.actualizado = row.actualizado_en instanceof Date ? row.actualizado_en.toISOString() : row.actualizado_en;
      }
    }

    return respond({ status: 'success', msg: '', detalles: { impresion, conexion } });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return badRequest('Body inválido (se esperaba JSON).');
  }

  const apiKey = String(body.apiKey || '').trim();
  if (!apiKey) return badRequest('apiKey es requerida.');
  if (apiKey.length < 8) return badRequest('La API key parece incompleta (mínimo 8 caracteres).');
  if (!configDisponible()) {
    return respond(
      { status: 'error', msg: 'Configuración no disponible: falta DATABASE_URL (Postgres).', detalles: null },
      500,
    );
  }

  try {
    await setConfig(CLAVE_API_KEY, apiKey);
    return respond({
      status: 'success',
      msg: 'API key guardada. La conexión queda administrada desde aquí.',
      detalles: { apiKey: mascara(apiKey) },
    });
  } catch (err) {
    return fail(err);
  }
}
