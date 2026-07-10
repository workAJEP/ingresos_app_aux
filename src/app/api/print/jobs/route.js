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

// El poller baja los trabajos (RPOP atómico dentro de drainJobs).
export async function GET(req) {
  if (!tokenOk(req)) return noAutorizado();
  if (!queueEnabled()) return NextResponse.json({ jobs: [], error: 'KV no configurada' }, { status: 200 });
  try {
    const jobs = await drainJobs();
    return NextResponse.json({ jobs }, { status: 200 });
  } catch (err) {
    console.error('[print/jobs]', err instanceof Error ? err.message : err);
    return NextResponse.json({ jobs: [], error: 'fallo al leer la cola' }, { status: 200 });
  }
}

// Diagnóstico: NO saca trabajos, solo informa el estado de la cola.
export async function POST(req) {
  if (!tokenOk(req)) return noAutorizado();
  const debug = req.nextUrl.searchParams.get('debug') === '1';
  if (!debug) return NextResponse.json({ error: 'usa ?debug=1' }, { status: 400 });
  try {
    return NextResponse.json(await queueStatus(), { status: 200 });
  } catch (err) {
    console.error('[print/jobs debug]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'KV no accesible' }, { status: 200 });
  }
}
