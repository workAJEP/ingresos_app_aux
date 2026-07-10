// Firma del token que viaja dentro del QR de cada bulto.
//
// El QR NO lleva datos legibles: lleva un token firmado con HMAC-SHA256 usando
// SESSION_SECRET (el mismo secreto de la cookie de sesión). Así el sticker es
// infalsificable: al escanear en "Despachar", el server recomputa la firma y
// solo valida si coincide. Si alguien inventa un código, no pasa el HMAC.
//
// Formato del token:  <payloadB64url>.<firmaB64url>
//   payload = base64url(JSON)  — datos mínimos del bulto (código + envío)
//   firma   = base64url(HMAC_SHA256(payload, SESSION_SECRET))
import crypto from 'crypto';

function secret() {
  const s = process.env.SESSION_SECRET || '';
  if (!s) throw new Error('SESSION_SECRET no definido: no se puede firmar el QR.');
  return s;
}

// base64 estándar -> base64url (sin +, /, ni = para que quepa limpio en un QR).
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(payloadB64) {
  return b64url(crypto.createHmac('sha256', secret()).update(payloadB64).digest());
}

// makeToken({ b: 'BLT0042/RL1', e: 'ENV123' }) -> string para el QR.
export function makeToken(data) {
  const payload = b64url(JSON.stringify(data));
  return `${payload}.${sign(payload)}`;
}

// verifyToken(token) -> objeto de datos si la firma es válida, o null.
// Usa timingSafeEqual para no filtrar la firma por tiempo de comparación.
export function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, firma] = token.split('.');
  if (!payload || !firma) return null;

  const esperada = sign(payload);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(fromB64url(payload).toString('utf8'));
  } catch {
    return null;
  }
}

// Un token nuestro tiene forma `<payloadB64url>.<firmaB64url>`: exactamente un
// punto y ambos lados en el alfabeto base64url. Un barcode normal (p.ej.
// "1B10697899") NO calza, así que sirve para distinguirlos.
const TOKEN_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export function pareceToken(s) {
  return typeof s === 'string' && TOKEN_RE.test(s);
}

// Decodifica lo que escanea la cámara/pistola y devuelve SIEMPRE el código real
// del bulto listo para buscar en Odoo:
//   - Si es un QR firmado por nosotros -> verifica la firma y extrae `.b`
//     (el código del bulto). Firma inválida -> { ok:false } (sticker falso o
//     firmado con otro SESSION_SECRET).
//   - Si es un barcode normal (sin forma de token) -> passthrough tal cual.
// NO hace toUpperCase: rompería la firma base64url de un token.
export function decodificarEscaneo(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { ok: false, firmado: false, codigo: '', error: 'Lectura vacía.' };
  if (!pareceToken(s)) return { ok: true, firmado: false, codigo: s };

  const data = verifyToken(s);
  if (!data || !data.b) {
    return { ok: false, firmado: true, codigo: '', error: 'Sticker inválido o firmado con otra clave.' };
  }
  return { ok: true, firmado: true, codigo: String(data.b), envio: data.e ? String(data.e) : '' };
}
