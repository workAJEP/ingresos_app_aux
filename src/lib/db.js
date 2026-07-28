// Cliente Postgres de la cola de impresión (reemplaza Upstash/Redis, que tiene tope de
// 500K comandos/mes). La BD corre en Docker en el servidor propio, aislada de la de Odoo
// y de la de App Etiquetas (contenedor, volumen, BD y puerto 5436 propios).
//
// Vercel es serverless: cada instancia mantiene su propio pool y se reusa entre
// invocaciones, por eso se cachea en globalThis (sobrevive el hot-reload de dev).
import { Pool } from 'pg';

export function dbEnabled() {
  return !!process.env.DATABASE_URL;
}

// Quita `sslmode`/`uselibpqcompat` de la URL: desde pg v8.22, `sslmode=require` en la
// cadena obliga a validar la cadena de certificados, y el del servidor es AUTOFIRMADO.
// El TLS se configura abajo con el objeto `ssl` (cifra el tráfico, sin validar la CA).
function connectionString() {
  const raw = process.env.DATABASE_URL || '';
  try {
    const u = new URL(raw);
    u.searchParams.delete('sslmode');
    u.searchParams.delete('uselibpqcompat');
    return u.toString();
  } catch {
    return raw;
  }
}

export function getPool() {
  if (!dbEnabled()) return null;
  if (!globalThis.__icPgPool) {
    globalThis.__icPgPool = new Pool({
      connectionString: connectionString(),
      // Certificado autofirmado: ciframos el tráfico pero no validamos la cadena.
      ssl: { rejectUnauthorized: false },
      max: 3, // pocas conexiones por instancia: hay muchas instancias serverless
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalThis.__icPgPool;
}

export async function query(text, params) {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL no está configurado');
  return pool.query(text, params);
}

// Info no destructiva para el endpoint de diagnóstico (?debug=1).
export function dbTarget() {
  const url = process.env.DATABASE_URL || '';
  try {
    const u = new URL(url);
    return { host: u.hostname, port: u.port || '5432', database: u.pathname.replace('/', '') };
  } catch {
    return { host: null, port: null, database: null };
  }
}
