// Normaliza un código de barras/QR leído (cámara/foto, pistola USB o input
// manual): UPPER + strip de espacios/controles; vacío o <7 caracteres -> error.
//
// FILTRO POR PROVEEDOR (en la app, confirmado con el negocio):
//  - SANTISTA (patrón `T` + solo dígitos, ej. T274086976): el barcode físico
//    trae 2 dígitos de control al final que NO están en el packing list
//    (la pieza es T2740869 y "76" va aparte) -> se recortan los últimos 2 y
//    se conservan como `extra`.
//  - Demás proveedores (ej. Vicunha 1B10697899): el código va COMPLETO, sin
//    recorte (el packing list guarda el UID entero).
// Isomórfico, sin dependencias (lo usan front y fakeOdoo).
const SANTISTA_RE = /^T\d{9,}$/; // T + 9+ dígitos = pieza (>=7) + 2 de control

export function normalizarBarcode(raw) {
  const cadena = String(raw == null ? '' : raw)
    .toUpperCase()
    .replace(/[\r\n\t\s]+/g, '');

  if (!cadena || cadena.length < 7) {
    return {
      ok: false,
      codigo: '',
      extra: '',
      error: 'El código es muy corto. Verifica la lectura.',
    };
  }

  if (SANTISTA_RE.test(cadena)) {
    return { ok: true, codigo: cadena.slice(0, -2), extra: cadena.slice(-2), error: null };
  }

  return { ok: true, codigo: cadena, extra: '', error: null };
}
