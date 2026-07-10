// Verifica si un barcode existe como rollo en Odoo (solo lectura).
// Uso: node scripts/check-rollo.mjs T274086976
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const xmlrpc = require('xmlrpc');

const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const call = (path, method, args) =>
  new Promise((res, rej) =>
    xmlrpc.createClient({ url: env.ODOO_URL + path }).methodCall(method, args, (e, v) => (e ? rej(e) : res(v))),
  );

const uid = await call('/xmlrpc/2/common', 'authenticate', [env.ODOO_DB, env.ODOO_USER, env.ODOO_PASSWORD, {}]);
const code = (process.argv[2] || '').toUpperCase();
const candidatos = [code, code.slice(0, -2)];
const rollos = await call('/xmlrpc/2/object', 'execute_kw', [
  env.ODOO_DB, uid, env.ODOO_PASSWORD,
  'distefano.importacion.rollo', 'search_read',
  [[['barcode', 'in', candidatos]]],
  { fields: ['id', 'barcode', 'estado', 'importacion_id', 'nombre'], limit: 5 },
]);
console.log('candidatos buscados:', candidatos);
console.log(rollos.length ? JSON.stringify(rollos, null, 1) : 'NO EXISTE ningún rollo con ese código (ni recortado).');
