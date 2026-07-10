// Cliente mínimo de la KV en la nube (Upstash for Redis vía REST).
// Sin dependencias: habla directo con la REST API de Upstash por fetch, así
// funciona igual en Node y en Edge. Vercel inyecta KV_REST_API_URL y
// KV_REST_API_TOKEN al conectar la base "Upstash for Redis" al proyecto.

const URL = () => process.env.KV_REST_API_URL || '';
const TOKEN = () => process.env.KV_REST_API_TOKEN || '';

// True si la cola en la nube está configurada (Camino A del runbook).
export function queueEnabled() {
  return Boolean(URL() && TOKEN());
}

// Host de Upstash (para el endpoint de diagnóstico ?debug=1).
export function kvHost() {
  try {
    return new global.URL(URL()).host;
  } catch {
    return null;
  }
}

// Ejecuta UN comando Redis. redis(['LPUSH', key, val]) -> result.
// La REST API de Upstash recibe el comando como array JSON y responde
// { result } o { error }.
export async function redis(command) {
  if (!queueEnabled()) throw new Error('KV no configurada (faltan KV_REST_API_URL / KV_REST_API_TOKEN).');
  const res = await fetch(URL(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  const data = await res.json();
  if (data.error) throw new Error(`Upstash: ${data.error}`);
  return data.result;
}

// Ejecuta varios comandos en un solo round-trip. pipeline([['RPOP',k],['RPOP',k]]).
export async function pipeline(commands) {
  if (!queueEnabled()) throw new Error('KV no configurada.');
  const res = await fetch(`${URL()}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
    cache: 'no-store',
  });
  const data = await res.json();
  if (data.error) throw new Error(`Upstash: ${data.error}`);
  // Cada elemento es { result } o { error }.
  return data.map((r) => (r && r.error ? null : r.result));
}
