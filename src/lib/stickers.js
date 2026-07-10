// Formato de etiqueta y reglas de negocio de los stickers de bulto.
//
// - buildStickerRows: aplica las reglas (copias, rollos, mixto) y firma el QR.
// - toCSV: serializa las filas al CSV que consume BarTender / el poller.
// - renderFallbackHTML: impresión de respaldo por navegador (el diseño real de
//   producción vive en el .btw de BarTender; esto es solo un fallback).
import { makeToken } from '@/lib/qrtoken';

export const CSV_HEADER = 'token,bulto,marchamo,envio,destino,origen';
export const MIN_COPIAS = 3;
export const MAX_COPIAS = 20;

// Normaliza el número de copias por bulto (mín 3, máx 20, default 3).
export function normalizarCopias(copias) {
  const n = Number.parseInt(copias, 10);
  if (!Number.isFinite(n)) return MIN_COPIAS;
  return Math.min(MAX_COPIAS, Math.max(MIN_COPIAS, n));
}

// Ubicaciones largas en cargas manuales: se resume al último tramo de "A/B/C".
// "BODEGA/PASILLO 3/RACK 12" -> "RACK 12" (recortado a 24 chars).
export function resumirUbicacion(ubi) {
  if (!ubi) return '';
  const tramo = String(ubi).split('/').pop().trim();
  return tramo.slice(0, 24);
}

// Construye una fila de sticker (token firmado + campos del CSV).
function fila(label, bulto) {
  const destino = bulto.resumirDestino ? resumirUbicacion(bulto.destino) : bulto.destino || '';
  return {
    token: makeToken({ b: label, e: bulto.envio || '' }),
    bulto: label,
    marchamo: bulto.marchamo || '',
    envio: bulto.envio || '',
    destino,
    origen: bulto.origen || '',
  };
}

// Expande un bulto a sus filas de sticker según las reglas del runbook.
//   bulto = { codigo, marchamo, envio, destino, origen,
//             rollos: <int>, tieneNoRollo: <bool>, resumirDestino: <bool> }
// Reglas:
//   - Con rollos:   1 sticker por rollo -> `${codigo}/RL1`, `/RL2`, ...
//                   + 1 sticker base (`codigo`) × copias si además lleva
//                     material que no es rollo (bulto mixto).
//   - Sin rollos:   1 sticker base (`codigo`) × copias.
export function expandirBulto(bulto, copias = MIN_COPIAS) {
  const c = normalizarCopias(copias);
  const rollos = Number.parseInt(bulto.rollos, 10) || 0;
  const rows = [];

  if (rollos > 0) {
    for (let i = 1; i <= rollos; i++) rows.push(fila(`${bulto.codigo}/RL${i}`, bulto));
    if (bulto.tieneNoRollo) for (let k = 0; k < c; k++) rows.push(fila(bulto.codigo, bulto));
  } else {
    for (let k = 0; k < c; k++) rows.push(fila(bulto.codigo, bulto));
  }
  return rows;
}

// Arma todas las filas de una impresión (varios bultos).
export function buildStickerRows(bultos, copias = MIN_COPIAS) {
  return bultos.flatMap((b) => expandirBulto(b, copias));
}

// --- CSV ---------------------------------------------------------------
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const CSV_COLS = ['token', 'bulto', 'marchamo', 'envio', 'destino', 'origen'];

export function toCSV(rows) {
  const lines = [CSV_HEADER];
  for (const r of rows) lines.push(CSV_COLS.map((c) => csvCell(r[c])).join(','));
  return lines.join('\r\n');
}

// --- Fallback por navegador -------------------------------------------
// Etiquetas 50×30 mm para imprimir desde el navegador si no hay BarTender.
// NOTA: para un QR escaneable en el fallback hace falta generar la imagen del
// QR en el cliente (p.ej. dep `qrcode`); aquí se imprime el token en texto.
// La impresión real de producción la hace el .btw en BarTender.
export function renderFallbackHTML(rows) {
  const etiquetas = rows
    .map(
      (r) => `
      <div class="sticker">
        <div class="bulto">${r.bulto}</div>
        <div class="meta">${r.envio || ''} · ${r.marchamo || ''}</div>
        <div class="dest">${r.destino || ''}</div>
        <div class="token">${r.token}</div>
      </div>`,
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Stickers</title>
  <style>
    @page { size: 50mm 30mm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; }
    .sticker { width: 50mm; height: 30mm; padding: 2mm; page-break-after: always;
               display: flex; flex-direction: column; justify-content: space-between; }
    .bulto { font-size: 14pt; font-weight: 700; }
    .meta  { font-size: 8pt; }
    .dest  { font-size: 9pt; font-weight: 600; }
    .token { font-size: 5pt; word-break: break-all; color: #555; }
  </style></head><body onload="print()">${etiquetas}</body></html>`;
}
