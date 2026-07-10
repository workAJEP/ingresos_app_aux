// Cliente Odoo 8 vía XML-RPC (solo server-side).
// Port de Despachos_app_aux/src/lib/odoo.js (mismo servidor Odoo). Se retiran
// odooAuthenticate / getAllowedCompanies / odooUserInAnyGroup /
// atribuirUltimoLogEstatus — esta app no tiene login de usuario final (F1
// = LAN, sin auth); todas las llamadas corren con la cuenta de servicio
// (ODOO_USER/ODOO_PASSWORD) definida en .env.local.
//
// Se conserva: keep-alive agents, caché de clientes XML-RPC por path, getUid
// con fallback /xmlrpc/2/common -> /xmlrpc/common (Odoo 8).
// Se añade: timeout por llamada vía Promise.race (8s default; 30s para las
// cargas masivas de rollos — ver LOAD_TIMEOUT_MS) y el hook ODOO_FAKE=1, que
// desvía cada función exportada a src/lib/fakeOdoo.js (emulación in-memory,
// sin tocar Odoo real — la usa el Agente C para desarrollar el frontend).
import xmlrpc from 'xmlrpc';
import http from 'http';
import https from 'https';

// Keep-alive: reutiliza conexiones TCP/TLS entre llamadas (evita pagar un
// handshake completo por cada consulta a Odoo).
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 24, keepAliveMsecs: 15000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 24, keepAliveMsecs: 15000 });

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USER = process.env.ODOO_USER;
const ODOO_PASSWORD = process.env.ODOO_PASSWORD;

const DEFAULT_TIMEOUT_MS = 8000;
// Timeout largo para cargar_rollos (chunks de hasta 500 filas): validar/crear
// 500 registros + recalcular tracking del expediente puede tardar más que el
// timeout general de una llamada de negocio simple.
export const LOAD_TIMEOUT_MS = 30000;

function isFake() {
  return process.env.ODOO_FAKE === '1';
}

function assertEnv() {
  const missing = [];
  if (!ODOO_URL) missing.push('ODOO_URL');
  if (!ODOO_DB) missing.push('ODOO_DB');
  if (!ODOO_USER) missing.push('ODOO_USER');
  if (!ODOO_PASSWORD) missing.push('ODOO_PASSWORD');
  if (missing.length) {
    throw new Error(`Faltan variables de entorno: ${missing.join(', ')}. Rellena .env.local`);
  }
}

function parseUrl(url) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : parsed.protocol === 'https:' ? 443 : 80,
    secure: parsed.protocol === 'https:',
  };
}

// Clientes cacheados por path (uno por endpoint XML-RPC). El socket lo maneja
// el keep-alive agent; reusar el cliente evita recrearlo en cada llamada.
const _clients = {};
function createClient(path) {
  if (_clients[path]) return _clients[path];
  const base = parseUrl(ODOO_URL);
  const opts = {
    host: base.host,
    port: base.port,
    path,
    agent: base.secure ? httpsAgent : httpAgent,
  };
  const client = base.secure ? xmlrpc.createSecureClient(opts) : xmlrpc.createClient(opts);
  _clients[path] = client;
  return client;
}

// Envuelve una promesa con un timeout duro (Promise.race). Sin esto, una
// llamada colgada a Odoo (red caída, servidor ocupado) dejaría la ruta Next
// esperando indefinidamente; con esto, el caller siempre recibe una respuesta
// a tiempo y las rutas la traducen a 503 (lib/http.js -> failOdoo).
function withTimeout(promise, ms, label) {
  if (!ms) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Tiempo de espera agotado llamando a Odoo${label ? ` (${label})` : ''} tras ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function call(client, method, params, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const promise = new Promise((resolve, reject) => {
    client.methodCall(method, params, (err, value) => {
      if (err) reject(err);
      else resolve(value);
    });
  });
  return withTimeout(promise, timeoutMs, method);
}

let _uid = null;
let _objectPath = '/xmlrpc/2/object';

async function getUid(timeoutMs = DEFAULT_TIMEOUT_MS) {
  assertEnv();
  if (_uid) return _uid;

  // /xmlrpc/2/common (Odoo 9+) con fallback a /xmlrpc/common (Odoo 8, que es
  // el que corre este servidor).
  const paths = ['/xmlrpc/2/common', '/xmlrpc/common'];
  let lastErr;
  for (const path of paths) {
    try {
      const client = createClient(path);
      const uid = await call(client, 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASSWORD, {}], timeoutMs);
      if (uid && typeof uid === 'number') {
        _uid = uid;
        _objectPath = path.replace('common', 'object');
        return uid;
      }
      lastErr = new Error(`Auth devolvió: ${JSON.stringify(uid)}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `Autenticación Odoo falló — DB:${ODOO_DB} USER:${ODOO_USER} — ${lastErr instanceof Error ? lastErr.message : lastErr}`,
  );
}

// Ping de salud para GET /api/health. A diferencia de getUid() (que cachea el
// uid indefinidamente), SIEMPRE reautentica: es la única forma de medir
// latencia real y detectar que Odoo está caído en una llamada posterior a la
// primera (si solo devolviéramos el uid cacheado, health nunca detectaría una
// caída después del primer arranque exitoso). Decisión propia — no estaba en
// el contrato original de funciones a portar, pero lo exige la ruta /health.
export async function pingOdoo(timeoutMs = 4000) {
  if (isFake()) {
    return require('./fakeOdoo').pingOdoo(timeoutMs);
  }
  assertEnv();
  const paths = ['/xmlrpc/2/common', '/xmlrpc/common'];
  const start = Date.now();
  let lastErr;
  for (const path of paths) {
    try {
      const client = createClient(path);
      const uid = await call(client, 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASSWORD, {}], timeoutMs);
      if (uid && typeof uid === 'number') {
        _uid = uid;
        _objectPath = path.replace('common', 'object');
        return { ok: true, uid, latencyMs: Date.now() - start, db: ODOO_DB };
      }
      lastErr = new Error(`Auth devolvió: ${JSON.stringify(uid)}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('No se pudo conectar con Odoo.');
}

// `context` (opcional): p.ej. { lang, tz } — no se usa hoy pero se deja igual
// que en Despachos por si hace falta más adelante.
export async function odooSearchRead(
  model,
  domain,
  fields,
  limit = 80,
  offset = 0,
  order = null,
  context = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  if (isFake()) {
    return require('./fakeOdoo').odooSearchRead(model, domain, fields, limit, offset, order, context);
  }
  const uid = await getUid();
  const client = createClient(_objectPath);
  const kwargs = { fields, limit, offset };
  if (order) kwargs.order = order;
  if (context) kwargs.context = context;
  return call(
    client,
    'execute_kw',
    [ODOO_DB, uid, ODOO_PASSWORD, model, 'search_read', [domain], kwargs],
    timeoutMs,
  );
}

export async function odooSearchCount(model, domain, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (isFake()) {
    return require('./fakeOdoo').odooSearchCount(model, domain);
  }
  const uid = await getUid();
  const client = createClient(_objectPath);
  return call(
    client,
    'execute_kw',
    [ODOO_DB, uid, ODOO_PASSWORD, model, 'search_count', [domain], {}],
    timeoutMs,
  );
}

export async function odooCreate(model, vals, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (isFake()) {
    return require('./fakeOdoo').odooCreate(model, vals);
  }
  const uid = await getUid();
  const client = createClient(_objectPath);
  return call(
    client,
    'execute_kw',
    [ODOO_DB, uid, ODOO_PASSWORD, model, 'create', [vals]],
    timeoutMs,
  );
}

// Valida credenciales de un usuario contra Odoo. Devuelve uid (número) o false.
// Se usa para el LOGIN de la app (auth contra la DB Odoo con las credenciales
// del PROPIO usuario, no la cuenta de servicio).
export async function odooAuthenticate(login, password) {
  if (isFake()) {
    return require('./fakeOdoo').odooAuthenticate(login, password);
  }
  assertEnv();
  const paths = ['/xmlrpc/2/common', '/xmlrpc/common'];
  let lastErr;
  for (const path of paths) {
    try {
      const client = createClient(path);
      const uid = await call(client, 'authenticate', [ODOO_DB, login, password, {}]);
      if (uid && typeof uid === 'number') return uid;
      // El endpoint respondió: credenciales inválidas → no seguir probando.
      if (uid === false) return false;
    } catch (e) {
      lastErr = e; // endpoint no disponible → probar el siguiente
    }
  }
  if (lastErr) throw lastErr;
  return false;
}

// Autorización: ¿el usuario `uid` pertenece a ALGUNO de los grupos dados
// (xml_id, p.ej. 'base.group_user')? Resuelve cada xml_id a su id vía
// ir.model.data y consulta res.users.groups_id. Corre con la cuenta de
// servicio. FAIL-CLOSED: si el RPC falla o el grupo no existe devuelve false.
// opts.strict: relanza el error de RPC en vez de tragarlo — permite al caller
// distinguir "Odoo caído" (503) de "usuario sin permiso" (403).
export async function odooUserInAnyGroup(uid, groupXmlIds, opts = {}) {
  if (isFake()) {
    return require('./fakeOdoo').odooUserInAnyGroup(uid, groupXmlIds, opts);
  }
  if (!uid || !Array.isArray(groupXmlIds) || !groupXmlIds.length) return false;
  try {
    const gids = [];
    for (const x of groupXmlIds) {
      const dot = x.indexOf('.');
      if (dot < 1) continue;
      // get_object_reference(module, name) -> [model, res_id]
      const ref = await odooKw('ir.model.data', 'get_object_reference', [
        x.slice(0, dot),
        x.slice(dot + 1),
      ]);
      if (Array.isArray(ref) && ref[1]) gids.push(ref[1]);
    }
    if (!gids.length) return false;
    const count = await odooSearchCount('res.users', [
      ['id', '=', uid],
      ['groups_id', 'in', gids],
    ]);
    return count > 0;
  } catch (e) {
    if (opts.strict) throw e;
    console.error('[odoo] odooUserInAnyGroup fail-closed:', e instanceof Error ? e.message : e);
    return false;
  }
}

// Llamada genérica a cualquier método del ORM (read, write, métodos custom
// del módulo distefano_importaciones: scan_ingreso, scan_piloto, ...).
export async function odooKw(model, method, args = [], kwargs = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (isFake()) {
    return require('./fakeOdoo').odooKw(model, method, args, kwargs);
  }
  const uid = await getUid();
  const client = createClient(_objectPath);
  return call(
    client,
    'execute_kw',
    [ODOO_DB, uid, ODOO_PASSWORD, model, method, args, kwargs],
    timeoutMs,
  );
}
