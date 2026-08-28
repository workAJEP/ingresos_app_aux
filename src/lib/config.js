// Configuración de la app: pares clave/valor en Postgres (tabla app_config).
// La usa el apartado Configuración (p.ej. la API key de conexión que genera
// otra app). Requiere DATABASE_URL — sin Postgres no hay dónde persistir.
import { dbEnabled, query } from '@/lib/db';

export function configDisponible() {
  return dbEnabled();
}

export async function getConfig(clave) {
  const { rows } = await query(
    `SELECT valor, actualizado_en FROM app_config WHERE clave = $1`,
    [clave],
  );
  return rows[0] || null;
}

export async function setConfig(clave, valor) {
  await query(
    `INSERT INTO app_config (clave, valor, actualizado_en) VALUES ($1, $2, now())
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`,
    [clave, valor],
  );
}
