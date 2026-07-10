// Normaliza un código de barras/QR leído (cámara/foto, pistola USB o input
// manual): UPPER + strip de espacios/controles; vacío o <7 caracteres -> error.
//
// NO recorta caracteres: el código escaneado suele coincidir EXACTO con el
// barcode del packing list (caso Vicunha: el NUMERO, p.ej. 1B10697899, es el
// UID completo del rollo). El posible recorte de 2 dígitos extra de etiquetas
// antiguas se maneja como FALLBACK en la búsqueda del servidor
// (Odoo _lock_por_barcode / fakeOdoo), no aquí. Isomórfico, sin dependencias.
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

  return { ok: true, codigo: cadena, extra: '', error: null };
}
