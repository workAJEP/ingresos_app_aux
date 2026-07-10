// Endpoint que consume el poller de la PC de la impresora (Camino A).
//   GET  /api/print/jobs            -> saca y devuelve los trabajos pendientes
//   POST /api/print/jobs?debug=1    -> diagnóstico (host de la KV, key, largo)
//
// Se autentica con la cabecera `x-pull-token` == PRINT_PULL_TOKEN, NO con la
// cookie de sesión (el poller no tiene sesión). Por eso esta ruta está en la
// lista pública del middleware, y valida el token aquí mismo.
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { drainJobs, queueStatus } from '@/lib/queue';
import { queueEnabled } from '@/lib/kv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Compara el token del poller contra PRINT_PULL_TOKEN sin fugas de tiempo.
function tokenOk(req) {
  const enviado = req.headers.get('x-pull-token') || '';
  const esperado = process.env.PRINT_PULL_TOKEN || '';
  if (!esperado) return false; // sin token configurado, nadie pasa
  const a = Buffer.from(enviado);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const noAutorizado = () => NextResponse.json({ error: 'no autorizado' }, { status: 401 });

// Saca (RPOP atómico) y devuelve los trabajos pendientes. No-store para que
// ningún CDN cachee la respuesta y reimprima trabajos ya bajados.
async function pull() {
  if (!queueEnabled()) return NextResponse.json({ jobs: [], error: 'KV no configurada' }, { status: 200 });
  try {
    const jobs = await drainJobs();
    return NextResponse.json({ jobs }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[print/jobs]', err instanceof Error ? err.message : err);
    return NextResponse.json({ jobs: [], error: 'fallo al leer la cola' }, { status: 200 });
  }
}

// GET: el poller PowerShell baja los trabajos.
export async function GET(req) {
  if (!tokenOk(req)) return noAutorizado();
  return pull();
}

// POST: el poller Python baja los trabajos por POST (evita el cacheo de GET
// del CDN de Vercel, que causaba reimpresiones). POST ?debug=1 NO saca nada:
// solo informa el estado de la cola (host, key, llen).
export async function POST(req) {
  if (!tokenOk(req)) return noAutorizado();
  if (req.nextUrl.searchParams.get('debug') === '1') {
    try {
      return NextResponse.json(await queueStatus(), { status: 200 });
    } catch (err) {
      console.error('[print/jobs debug]', err instanceof Error ? err.message : err);
      return NextResponse.json({ error: 'KV no accesible' }, { status: 200 });
    }
  }
  return pull();
}
