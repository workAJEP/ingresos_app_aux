// Cola de impresión en la nube (modelo pull).
//
// La web (Vercel, stateless) NO puede hablarle a la impresora en bodega. Por
// eso encola los trabajos y la PC de la impresora los "jala":
//   - Web:    enqueueJob(job)  -> INSERT print_jobs   (o LPUSH si solo hay KV)
//   - Poller: drainJobs()      -> UPDATE ... FOR UPDATE SKIP LOCKED (o RPOP)
//
// Camino principal: POSTGRES propio (tabla print_jobs), sin tope de peticiones.
// Respaldo (legado): Upstash/Redis, con tope de 500K comandos/mes. La app elige
// por configuración: si existe DATABASE_URL usa Postgres; si no, KV. Así la
// migración es sin corte y las variables de KV se borran al final.
import { dbEnabled, dbTarget, query } from '@/lib/db';
import { redis, pipeline, kvHost, queueEnabled as kvEnabled } from '@/lib/kv';

export const QUEUE_KEY = 'dd:print:jobs'; // key de la cola en KV (legado)
const TIPO = 'stickers'; // esta app tiene un solo tipo de trabajo
const MAX_QUEUE = 500; // tope de seguridad (KV)
const MAX_DRAIN = 100; // máx. trabajos que el poller baja por sondeo

// Hay cola si hay Postgres o KV configurados.
export function queueEnabled() {
  return dbEnabled() || kvEnabled();
}

// Encola un trabajo de impresión. `job` es serializable: { rows, meta, ts }.
export async function enqueueJob(job) {
  if (dbEnabled()) {
    await query(
      `INSERT INTO print_jobs (tipo, usuario, filas, meta) VALUES ($1, $2, $3, $4)`,
      [TIPO, String((job.meta && job.meta.by) || ''), JSON.stringify(job.rows || []), JSON.stringify(job.meta || {})],
    );
    return { via: 'postgres' };
  }
  await redis(['LPUSH', QUEUE_KEY, JSON.stringify(job)]);
  await redis(['LTRIM', QUEUE_KEY, 0, MAX_QUEUE - 1]);
  return { via: 'kv' };
}

// Saca (y elimina/marca) los trabajos pendientes. Devuelve array de objetos job
// con la misma forma que se encoló: { rows, meta, ts } (el poller solo usa rows).
export async function drainJobs() {
  if (dbEnabled()) {
    // Marca y devuelve en el MISMO statement con FOR UPDATE SKIP LOCKED:
    // atómico, dos pollers nunca se llevan el mismo trabajo (igual que RPOP).
    const { rows } = await query(
      `UPDATE print_jobs j
          SET tomado_en = now()
         FROM (
           SELECT id FROM print_jobs
            WHERE tomado_en IS NULL
            ORDER BY id
            LIMIT $1
            FOR UPDATE SKIP LOCKED
         ) sel
        WHERE j.id = sel.id
      RETURNING j.filas, j.meta, j.creado_en`,
      [MAX_DRAIN],
    );
    return rows.map((r) => ({
      rows: r.filas,
      meta: r.meta,
      ts: r.creado_en instanceof Date ? r.creado_en.getTime() : r.creado_en,
    }));
  }

  // --- Respaldo KV (legado) ---
  const len = Number(await redis(['LLEN', QUEUE_KEY])) || 0;
  if (len === 0) return [];
  const n = Math.min(len, MAX_DRAIN);
  const results = await pipeline(Array.from({ length: n }, () => ['RPOP', QUEUE_KEY]));
  return results
    .filter(Boolean) // descarta nulls (cola vacía entre lecturas)
    .map((raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// Estado de la cola para diagnóstico (?debug=1). `store` dice qué backend está
// usando el deployment ACTUAL: si dice "kv" con DATABASE_URL puesta, falta redeploy.
export async function queueStatus() {
  if (dbEnabled()) {
    const { rows } = await query(
      `SELECT count(*) FILTER (WHERE tomado_en IS NULL) AS pendientes, count(*) AS total FROM print_jobs`,
    );
    const r = rows[0] || {};
    return { store: 'postgres', ...dbTarget(), pendientes: Number(r.pendientes) || 0, total: Number(r.total) || 0 };
  }
  const llen = Number(await redis(['LLEN', QUEUE_KEY])) || 0;
  return { store: 'kv', host: kvHost(), key: QUEUE_KEY, llen };
}
