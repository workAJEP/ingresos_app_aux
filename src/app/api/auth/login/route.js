import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions } from '@/lib/session';
import { odooAuthenticate, odooUserInAnyGroup, odooSearchRead } from '@/lib/odoo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REQUIRE_GROUPS = (process.env.REQUIRE_ODOO_GROUPS || 'base.group_user')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const EXTRA_ALLOWED = (process.env.EXTRA_ALLOWED_LOGINS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Rate-limit SIMPLE en memoria por IP (esta app no tiene KV). Módulo-singleton:
// máx 8 intentos por ventana de 5 min. Se limpia el bucket tras un login OK.
const RL_MAX = Number(process.env.LOGIN_RL_MAX || 8);
const RL_WINDOW_MS = Number(process.env.LOGIN_RL_WINDOW_SEC || 300) * 1000;
const _attempts = new Map(); // ip -> { count, resetAt }

function checkLimit(ip) {
  const now = Date.now();
  const rec = _attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    _attempts.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
    return { limited: false };
  }
  rec.count += 1;
  if (rec.count > RL_MAX) {
    return { limited: true, retryAfter: Math.ceil((rec.resetAt - now) / 1000) };
  }
  return { limited: false };
}

function clientIp(req) {
  const xffLast = (req.headers.get('x-forwarded-for') || '').split(',').pop().trim();
  return req.headers.get('x-real-ip') || xffLast || 'unknown';
}

// POST /api/auth/login  { login, password }
export async function POST(req) {
  try {
    const ip = clientIp(req);
    const rl = checkLimit(ip);
    if (rl.limited) {
      return NextResponse.json(
        { status: 'error', msg: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.', detalles: null },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const login = (body.login || '').trim();
    const password = body.password || '';
    if (!login || !password) {
      return NextResponse.json(
        { status: 'error', msg: 'Usuario y contraseña requeridos', detalles: null },
        { status: 400 },
      );
    }

    // 1) Autenticación contra Odoo con las credenciales del PROPIO usuario.
    const uid = await odooAuthenticate(login, password);
    if (!uid) {
      return NextResponse.json(
        { status: 'error', msg: 'Credenciales inválidas', detalles: null },
        { status: 401 },
      );
    }

    // 2) Autorización: grupo Odoo permitido O login en la allowlist de env.
    const lower = login.toLowerCase();
    let authorized = EXTRA_ALLOWED.includes(lower);
    if (!authorized) {
      try {
        authorized = await odooUserInAnyGroup(uid, REQUIRE_GROUPS, { strict: true });
      } catch (e) {
        console.error('[auth/login] Odoo no disponible al verificar grupos:', e instanceof Error ? e.message : e);
        return NextResponse.json(
          { status: 'error', msg: 'Odoo no disponible. Intenta de nuevo en unos minutos.', detalles: null },
          { status: 503 },
        );
      }
    }
    if (!authorized) {
      return NextResponse.json(
        { status: 'error', msg: 'No tienes acceso a Ingreso de Contenedores. Pide habilitación a tu administrador.', detalles: null },
        { status: 403 },
      );
    }

    // 3) Nombre real del usuario (best-effort).
    let name = login;
    try {
      const u = await odooSearchRead('res.users', [['id', '=', uid]], ['name'], 1);
      if (u && u.length && u[0].name) name = u[0].name;
    } catch (e) {
      /* opcional: si falla se usa el login como nombre */
    }

    const session = await getIronSession(cookies(), sessionOptions);
    session.uid = uid;
    session.login = login;
    session.name = name;
    session.authorized = true;
    await session.save();

    _attempts.delete(ip); // login OK → no castigar al usuario legítimo
    return NextResponse.json({ ok: true, uid, name });
  } catch (err) {
    console.error('[auth/login]', err instanceof Error ? err.stack || err.message : err);
    return NextResponse.json(
      { status: 'error', msg: 'Ocurrió un error inesperado. Inténtalo de nuevo.', detalles: null },
      { status: 500 },
    );
  }
}
