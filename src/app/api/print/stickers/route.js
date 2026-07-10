// POST /api/print/stickers
// Arma los stickers de una impresión, firma el QR de cada bulto y encola el
// trabajo en la nube (Camino A). La PC de la impresora lo baja por
// /api/print/jobs y lo imprime con BarTender.
//
// Body: {
//   bultos:   [{ codigo, marchamo, envio, destino, origen, rollos, tieneNoRollo, resumirDestino }],
//   copias:   <int 3..20, default 3>,
//   emergencia: <bool>   // reimpresión de emergencia: SOLO admin, salta el chequeo de etapa
//   estatus:  <string>   // etapa actual del envío (opcional)
// }
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions } from '@/lib/session';
import { respond, badRequest, fail } from '@/lib/http';
import { buildStickerRows, normalizarCopias } from '@/lib/stickers';
import { enqueueJob, queueEnabled } from '@/lib/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Etapas en las que se permite imprimir stickers (fuera de emergencia).
// Ajusta esta lista al modelo de estatus real de tu flujo de despacho.
const ESTADOS_DESPACHO = ['despacho', 'en_despacho', 'despachando'];

// No hay rol "admin" en la sesión; lo derivamos del login. Ajusta si más
// adelante guardas grupos de Odoo en la sesión.
function esAdmin(session) {
  const login = String(session.login || '').toLowerCase();
  const extra = (process.env.ADMIN_LOGINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return login === 'admin' || extra.includes(login);
}

export async function POST(req) {
  const session = await getIronSession(cookies(), sessionOptions);

  let body;
  try {
    body = await req.json();
  } catch {
    return badRequest('Body inválido (se esperaba JSON).');
  }

  const bultos = Array.isArray(body.bultos) ? body.bultos : [];
  const copias = normalizarCopias(body.copias);
  const emergencia = body.emergencia === true;
  const estatus = body.estatus ? String(body.estatus).trim() : '';

  if (bultos.length === 0) return badRequest('bultos es requerido (array no vacío).');
  for (const b of bultos) {
    if (!b || !b.codigo) return badRequest('Cada bulto necesita "codigo".');
  }

  // Reglas de negocio de cuándo se puede imprimir.
  if (emergencia) {
    if (!esAdmin(session)) {
      return respond(
        { status: 'error', msg: 'La reimpresión de emergencia es solo para administradores.', detalles: null },
        403,
      );
    }
  } else if (estatus && !ESTADOS_DESPACHO.includes(estatus)) {
    return respond(
      { status: 'warning', msg: 'Los stickers solo se imprimen en la etapa de despacho.', detalles: { estatus } },
      200,
    );
  }

  try {
    const rows = buildStickerRows(bultos, copias);

    if (!queueEnabled()) {
      // En Vercel se usa el Camino A (cola). Si no está la KV, no hay a dónde encolar.
      return respond(
        {
          status: 'error',
          msg: 'Cola de impresión no configurada. Falta conectar KV (Upstash) en Vercel.',
          detalles: null,
        },
        500,
      );
    }

    await enqueueJob({
      rows,
      meta: { by: session.login || null, emergencia, bultos: bultos.length },
      ts: Date.now(),
    });

    return respond({
      status: 'success',
      msg: `Enviado a imprimir: ${rows.length} sticker(s) de ${bultos.length} bulto(s).`,
      detalles: { stickers: rows.length, bultos: bultos.length, copias },
    });
  } catch (err) {
    return fail(err);
  }
}
