// Cola de impresión en la nube (Camino A del runbook).
//
// La web (Vercel, stateless) NO puede hablarle a la impresora en bodega. Por
// eso encola los trabajos y la PC de la impresora los "jala" (modelo pull):
//   - Web:    enqueueJob(job)  -> LPUSH  dd:print:jobs
//   - Poller: drainJobs()      -> RPOP   (saca los trabajos al leerlos)
//
// RPOP es atómico: dos lecturas nunca sacan el mismo trabajo. La cola se acota
// con LTRIM como red de seguridad (que un bug no la infle sin límite).
import { redis, pipeline, kvHost } from '@/lib/kv';

// Re-export: las rutas de print lo importan desde aquí.
export { queueEnabled } from '@/lib/kv';

export const QUEUE_KEY = 'dd:print:jobs';
const MAX_QUEUE = 500; // tope de seguridad
const MAX_DRAIN = 100; // máx. trabajos que el poller baja por sondeo

// Encola un trabajo de impresión. `job` es serializable: { rows, meta, ts }.
export async function enqueueJob(job) {
  await redis(['LPUSH', QUEUE_KEY, JSON.stringify(job)]);
  await redis(['LTRIM', QUEUE_KEY, 0, MAX_QUEUE - 1]);
}

// Saca (y elimina) los trabajos pendientes. Devuelve array de objetos job.
// Hace RPOP en pipeline hasta MAX_DRAIN o hasta que la cola quede vacía.
export async function drainJobs() {
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

// Estado de la cola para diagnóstico (?debug=1).
export async function queueStatus() {
  const llen = Number(await redis(['LLEN', QUEUE_KEY])) || 0;
  return { host: kvHost(), key: QUEUE_KEY, llen };
}
