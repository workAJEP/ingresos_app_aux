// Conversión de unidades de largo de rollo.
//
// El campo `yardas` de Odoo (`distefano.importacion.rollo`) en realidad trae
// METROS: el packing list ingresa el largo en metros y Odoo lo guarda tal cual
// bajo ese nombre. El sticker ya imprime yardas reales (×1.09361) desde el fix
// de stickers.js; estas utilidades aplican LA MISMA conversión a todo lo que la
// app muestra o exporta, para que reporte/manifiesto/CSV coincidan con lo
// impreso en el sticker.
export const METROS_A_YARDAS = 1.09361;

export const metrosAYardas = (v) => (Number(v) || 0) * METROS_A_YARDAS;

// Convierte in-place toda clave `yardas` dentro de un dict de negocio de Odoo
// ({status,msg,detalles}) — filas, totales, detalles sueltos. Respeta el tipo:
// si el valor era string formateado ("84.40") devuelve string con 2 decimales.
// Se usa en los wrappers RPC (lib/rollos.js), de modo que scan, tránsito,
// dashboard, recepción y manifiesto legado queden corregidos en un solo lugar.
export function corrigeYardasProfundo(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) corrigeYardasProfundo(item);
    return obj;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'yardas' && (typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v))))) {
      const conv = metrosAYardas(v);
      obj[k] = typeof v === 'string' ? conv.toFixed(2) : Number(conv.toFixed(2));
    } else if (v && typeof v === 'object') {
      corrigeYardasProfundo(v);
    }
  }
  return obj;
}
