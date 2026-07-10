// Normaliza un código de barras/QR leído (cámara, pistola USB o input manual).
//
// Interfaz CONGELADA (§3 del plan) — la consumen tanto el backend (server-side,
// vía fakeOdoo/rutas) como el frontend (validación antes de enviar el POST).
// Sin dependencias externas: isomórfico, funciona igual en Node y en el
// navegador. Reglas idénticas al GAS original (test.md): UPPER + strip de
// espacios/controles; longitud >=10 recorta los últimos 2 caracteres (código
// físico de la etiqueta trae 2 dígitos extra que NO forman parte del barcode
// almacenado — ver lib/parseExcel.js, que NO recorta).
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

  if (cadena.length >= 10) {
    return {
      ok: true,
      codigo: cadena.slice(0, -2),
      extra: cadena.slice(-2),
      error: null,
    };
  }

  return { ok: true, codigo: cadena, extra: '', error: null };
}
