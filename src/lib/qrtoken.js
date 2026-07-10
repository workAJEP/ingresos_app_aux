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
