// Verifica autenticación XML-RPC contra Odoo con las credenciales de .env.local (solo lectura).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const xmlrpc = require('xmlrpc');

const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const base = env.ODOO_URL;
const auth = (path, method, args) =>
  new Promise((res, rej) => xmlrpc.createClient({ url: base + path }).methodCall(method, args, (e, v) => (e ? rej(e) : res(v))));

try {
  const uid = await auth('/xmlrpc/2/common', 'authenticate', [env.ODOO_DB, env.ODOO_USER, env.ODOO_PASSWORD, {}]);
  console.log('OK /xmlrpc/2/common uid=' + uid);
} catch (e) {
  try {
    const uid = await auth('/xmlrpc/common', 'login', [env.ODOO_DB, env.ODOO_USER, env.ODOO_PASSWORD]);
    console.log('OK /xmlrpc/common (legacy) uid=' + uid);
  } catch (e2) {
    console.error('FAIL:', e2.message);
    process.exit(1);
  }
}
