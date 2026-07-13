// GET /api/odoo/productos?q=<texto>
// Sugerencias de "tela" (product.product, categoría Telas) para el editor de
// artículos: busca por Código Interno (default_code) o Nombre. Cada resultado
// trae también la Composición (campo `tipo`, many2one a distefano.product.tipo)
// para autocompletar el formulario al elegir un producto real de Odoo — la
// alternativa a que el usuario escriba todo a mano.
import { odooSearchRead } from '@/lib/odoo';
import { respond, failOdoo } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TELAS_CATEG_ID = Number(process.env.ODOO_TELAS_CATEG_ID || 368);
const MIN_CHARS = 1;

// Atributo "Color" de Odoo (product.attribute). El NOMBRE legible del color vive en
// sus valores (product.attribute.value): p.ej. la tela cuyo código de color es D1000
// tiene el valor "Azul Obscuro". El nombre del producto solo trae el CÓDIGO
// ("…código de color D1000"), que no sirve para la etiqueta.
const COLOR_ATTR_ID = Number(process.env.ODOO_COLOR_ATTR_ID || 1);

// Solo ~1 de cada 10 telas tiene el campo Composición (`tipo`) cargado en
// Odoo, pero el NOMBRE del producto casi siempre la trae embebida
// ("98%C/2%S", "65% Poliester 35%Algodón", "81%C 17%P 2%E"). Extrae del
// nombre los tramos "NN% Fibra" consecutivos como fallback.
// El nombre en Odoo trae todo pegado ("Tela Fleece FM-12855 65% Poliéster
// 35% Algodón Ancho 71¨ Peso 260gsm"), pero la etiqueta solo necesita el
// nombre puro ("Tela Fleece"). Se toman las palabras iniciales hasta topar
// con un código (algo con dígitos), un porcentaje o una palabra clave de
// especificación (Ancho, Peso, Color, Estilo…). Si no queda nada, se
// devuelve el nombre completo.
const CORTE_NOMBRE =
  /^(ancho|peso|color|estilo|ref|rollos?|titulo|título|sarga|tejido|gms?|gsm|grs?|oz|onzas?|yds?|mts?|cms?|mms?|pulg(adas?)?|denier|calibre|comp(osici[oó]n)?|ligamento|acabado)\.?,?$/i;
// Cotas del nombre corto: la etiqueta es chica — si la extracción se pasa de
// largo (nombres tipo "Tela Jersey Slub Rayado Listado Especial …"), se recorta
// por PALABRAS completas (sin cortar a media palabra).
const NOMBRE_MAX_PALABRAS = 4;
const NOMBRE_MAX_LARGO = 30;

function recortarPorPalabras(palabras) {
  const out = [];
  for (const w of palabras) {
    if (out.length >= NOMBRE_MAX_PALABRAS) break;
    const largo = out.join(' ').length + (out.length ? 1 : 0) + w.length;
    if (largo > NOMBRE_MAX_LARGO) break;
    out.push(w);
  }
  return out.join(' ').trim();
}

function nombreCortoDesdeNombre(nombre) {
  const palabras = String(nombre || '').trim().split(/\s+/);
  const corto = [];
  for (const w of palabras) {
    const limpia = w.replace(/[,;|]+$/, '');
    if (/[\d%]/.test(limpia) || CORTE_NOMBRE.test(limpia)) break;
    corto.push(limpia);
    if (/[,;|]$/.test(w)) break; // una coma cierra la frase del nombre
  }
  // Sin extracción al inicio (nombre arranca con código/números): tomar la PRIMERA
  // racha de palabras limpias en cualquier parte ("FM-128 Tela Fleece 65% …" →
  // "Tela Fleece") en vez del nombre completo kilométrico.
  let base = corto;
  if (!base.length) {
    for (const w of palabras) {
      const limpia = w.replace(/[,;|]+$/, '');
      if (/[\d%]/.test(limpia) || CORTE_NOMBRE.test(limpia)) {
        if (base.length) break; // se cerró la racha
        continue; // aún buscando el inicio de la racha
      }
      base.push(limpia);
      if (/[,;|]$/.test(w)) break;
    }
  }
  // Acotar SIEMPRE (la etiqueta es chica) por palabras completas.
  return recortarPorPalabras(base) || String(nombre || '').slice(0, NOMBRE_MAX_LARGO);
}

// Color embebido en el nombre del producto ("Tela Lamy Color Blanco" →
// "Blanco"). Se corta al llegar a una palabra de especificación o número.
function colorDesdeNombre(nombre) {
  const m = String(nombre || '').match(/\bCOLOR\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)?)/i);
  if (!m) return '';
  const palabras = m[1]
    .split(/\s+/)
    // Descarta restos de código: "…código de color D1000" capturaba la "D".
    // Un color legible tiene al menos 3 letras ("Azul", "Blanco"), nunca 1-2.
    .filter((w) => w.length >= 3 && !CORTE_NOMBRE.test(w));
  return palabras.join(' ').trim();
}

function composicionDesdeNombre(nombre) {
  const re = /\d{1,3}\s*%\s*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g;
  const partes = String(nombre || '').match(re) || [];
  return partes.length ? partes.map((p) => p.replace(/\s+/g, ' ').trim()).join(' ') : '';
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();

  if (q.length < MIN_CHARS) {
    return respond({ status: 'success', msg: '', detalles: { productos: [] } });
  }

  try {
    const productos = await odooSearchRead(
      'product.product',
      [
        ['categ_id', 'child_of', TELAS_CATEG_ID],
        '|',
        ['default_code', 'ilike', q],
        ['name', 'ilike', q],
      ],
      ['id', 'default_code', 'name', 'tipo', 'attribute_value_ids'],
      20,
    );

    // Nombre legible del color: se resuelven en UNA sola consulta los valores de
    // atributo de todos los productos y se toma el del atributo "Color".
    const valorIds = [...new Set(productos.flatMap((p) => p.attribute_value_ids || []))];
    const colorPorValorId = new Map();
    if (valorIds.length) {
      try {
        const valores = await odooSearchRead(
          'product.attribute.value',
          [['id', 'in', valorIds]],
          ['id', 'name', 'attribute_id'],
          200,
        );
        for (const v of valores) {
          const attrId = Array.isArray(v.attribute_id) ? v.attribute_id[0] : v.attribute_id;
          if (attrId === COLOR_ATTR_ID && v.name) colorPorValorId.set(v.id, v.name);
        }
      } catch (e) {
        // sin atributos → se cae al color embebido en el nombre (abajo)
      }
    }
    const colorDeProducto = (p) => {
      for (const vid of p.attribute_value_ids || []) {
        const nombre = colorPorValorId.get(vid);
        if (nombre) return nombre; // "Azul Obscuro", "Blanco"… (nombre, no el código)
      }
      return colorDesdeNombre(p.name); // último recurso
    };

    // Muchas telas NO tienen Código Interno en Odoo — se mantienen (el
    // frontend usa el nombre como valor), pero las que sí tienen código van
    // primero: son las que permiten el autocompletado exacto.
    const detalles = productos
      .map((p) => ({
        id: p.id,
        codigo: p.default_code || '',
        nombre: nombreCortoDesdeNombre(p.name),
        nombreCompleto: p.name || '',
        composicion: (Array.isArray(p.tipo) ? p.tipo[1] : '') || composicionDesdeNombre(p.name),
        color: colorDeProducto(p),
      }))
      .sort((a, b) => (b.codigo ? 1 : 0) - (a.codigo ? 1 : 0));

    return respond({ status: 'success', msg: '', detalles: { productos: detalles } });
  } catch (err) {
    return failOdoo(err);
  }
}
