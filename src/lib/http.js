// Helpers de respuesta HTTP uniformes para las rutas API (§3/§5 del plan).
// Shape end-to-end: { status: 'success'|'warning'|'info'|'error', msg, detalles }.
// El front decide beep/color según `status`; los mensajes técnicos (stack,
// URLs internas, credenciales) SOLO van a console.error del servidor, nunca
// al cliente.
import { NextResponse } from 'next/server';

// Éxito o resultado de negocio (incluye errores de negocio: HTTP 200, el
// `status` dentro del body indica éxito/advertencia/error).
export function respond(dict, status = 200) {
  return NextResponse.json(dict, { status });
}

// 400 — payload del cliente inválido/incompleto (antes de tocar Odoo).
export function badRequest(msg) {
  return NextResponse.json(
    { status: 'error', msg: msg || 'Solicitud inválida.', detalles: null },
    { status: 400 },
  );
}

// 503 — la llamada RPC a Odoo falló (red, timeout, servidor caído). El front
// muestra el banner global "Sin conexión con Odoo" (OdooStatusBanner).
export function failOdoo(err) {
  console.error('[odoo-rpc]', err instanceof Error ? err.message : err);
  return NextResponse.json(
    {
      status: 'error',
      msg: 'Sin conexión con Odoo. Verifica la red o intenta de nuevo en unos segundos.',
      detalles: null,
    },
    { status: 503 },
  );
}

// 500 — error inesperado que no es un fallo de RPC (bug, parseo, etc.).
export function fail(err) {
  console.error('[api-error]', err instanceof Error ? err.stack || err.message : err);
  return NextResponse.json(
    {
      status: 'error',
      msg: 'Ocurrió un error inesperado. Inténtalo de nuevo o avisa a soporte.',
      detalles: null,
    },
    { status: 500 },
  );
}
