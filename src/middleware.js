import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/session';

function isPublic(pathname) {
  return (
    pathname === '/login' ||
    // Assets de la PWA/favicon: deben servirse sin sesión.
    pathname === '/manifest.webmanifest' ||
    pathname === '/icon.svg' ||
    pathname === '/icon-192.png' ||
    pathname === '/icon-512.png' ||
    pathname === '/apple-icon.png' ||
    pathname.startsWith('/api/auth') ||
    // El poller de la impresora se autentica con x-pull-token, no con sesión.
    pathname === '/api/print/jobs'
  );
}

// Protege toda la app. Sin sesión válida:
//  - rutas de página → redirige a /login?next=<path>
//  - rutas /api/*    → 401 JSON con el shape { status:'error', msg }
export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const res = NextResponse.next();
  let uid = null;
  let authorized = false;
  try {
    const session = await getIronSession(req, res, sessionOptions);
    uid = session.uid;
    authorized = session.authorized; // se setea en el login tras pasar el gate de acceso
  } catch (e) {
    // Config faltante (p.ej. SESSION_SECRET sin definir) o cookie inválida:
    // no tumbar el sitio (evita 500), tratar como NO autenticado.
    console.error('[middleware] sesión:', e instanceof Error ? e.message : e);
  }

  if (!uid || !authorized) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { status: 'error', msg: 'No autenticado', detalles: null },
        { status: 401 },
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  // Excluye estáticos de Next y archivos sueltos (favicon, robots, etc.).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.png|robots.txt|sitemap.xml).*)'],
};
