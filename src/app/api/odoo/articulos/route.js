// Artículos de un expediente: agrupa los rollos por (nombre = artículo del
// proveedor, color) y permite COMPLETAR los datos maestros que NO vienen en el
// packing list y que la etiqueta necesita:
//   - Código  (cod_dist, ej. TTD-0150)  - código interno Distefano
//   - Color legible (ej. "Azul Obscuro") - el archivo trae solo el código (58L)
//   - Composición  (ej. "99% Algodón 1% Elastan")
//   - Nombre (se puede corregir)
//
// GET  /api/odoo/articulos?importacionId=13
//   -> { articulos: [{ nombre, color, codigo, composicion, rollos }] }
// POST /api/odoo/articulos
//   body { importacionId, articulos: [{ nombreOrig, colorOrig, nombre, codigo,
//          color, composicion }] }
//   -> escribe esos valores en TODOS los rollos del grupo.
import { odooSearchRead, odooKw } from '@/lib/odoo';
import { respond, badRequest, failOdoo } from '@/lib/http';
import { enriquecerProductos } from '@/lib/telas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX = 5000;
// product.category raíz "Telas" — mismo árbol que /api/odoo/productos.
const TELAS_CATEG_ID = Number(process.env.ODOO_TELAS_CATEG_ID || 368);

// Productos de las ÓRDENES DE COMPRA del expediente (purchase.order tiene
// importacion_id en el módulo distefano_importaciones). Son la fuente
// preferida del "Código de tela": el editor los sugiere primero y va
// descartando los ya usados en otros artículos. Si el expediente no tiene OC
// (o el modelo no está disponible, p.ej. ODOO_FAKE), devuelve [].
async function productosDeOC(importacionId) {
  try {
    const ordenes = await odooSearchRead(
      'purchase.order',
      [['importacion_id', '=', importacionId]],
      ['id', 'order_line'],
      50,
    );
    const lineIds = [...new Set(ordenes.flatMap((o) => o.order_line || []))];
    if (!lineIds.length) return [];
    const lineas = await odooSearchRead(
      'purchase.order.line',
      [['id', 'in', lineIds]],
      ['id', 'product_id'],
      lineIds.length,
    );
    const prodIds = [
      ...new Set(
        lineas.map((l) => (Array.isArray(l.product_id) ? l.product_id[0] : l.product_id)).filter(Boolean),
      ),
    ];
    if (!prodIds.length) return [];
    // Solo productos del árbol de categorías "Telas": las OC también traen
    // botones, hilos, fletes, etc., que no son válidos como Código de tela.
    const productos = await odooSearchRead(
      'product.product',
      [
        ['id', 'in', prodIds],
        ['categ_id', 'child_of', TELAS_CATEG_ID],
      ],
      ['id', 'default_code', 'name', 'tipo', 'attribute_value_ids'],
      prodIds.length,
    );
    return await enriquecerProductos(productos);
  } catch (e) {
    console.error('[articulos/oc]', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const importacionId = Number(searchParams.get('importacionId')) || 0;
  if (!importacionId) return badRequest('importacionId es requerido.');

  try {
    const rollos = await odooSearchRead(
      'distefano.importacion.rollo',
      [['importacion_id', '=', importacionId]],
      ['id', 'nombre', 'color', 'cod_dist', 'composicion'],
      MAX,
    );

    const grupos = new Map();
    for (const r of rollos) {
      const nombre = r.nombre || '';
      const color = r.color || '';
      const clave = `${nombre}|${color}`;
      if (!grupos.has(clave)) {
        grupos.set(clave, {
          nombre,
          color,
          codigo: r.cod_dist || '',
          composicion: r.composicion || '',
          rollos: 0,
        });
      }
      grupos.get(clave).rollos++;
    }

    const ocProductos = await productosDeOC(importacionId);

    return respond({
      status: 'success',
      msg: '',
      detalles: { articulos: [...grupos.values()], ocProductos },
    });
  } catch (err) {
    return failOdoo(err);
  }
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return badRequest('Body inválido (se esperaba JSON).');
  }

  const importacionId = Number(body.importacionId) || 0;
  const articulos = Array.isArray(body.articulos) ? body.articulos : [];
  if (!importacionId) return badRequest('importacionId es requerido.');
  if (!articulos.length) return badRequest('articulos es requerido (array no vacío).');

  try {
    let actualizados = 0;
    // Artículos cuyo grupo original (nombreOrig+colorOrig) no matcheó ningún
    // rollo: antes esto se ignoraba en silencio (`continue`) y el usuario
    // recibía un mensaje de "éxito" genérico aunque ESE artículo no se
    // hubiera tocado — causa real de "la composición no se coloca
    // correctamente" cuando el grupo cambiaba entre el GET y el POST.
    const noActualizados = [];

    for (const a of articulos) {
      // Claves ORIGINALES del grupo (pueden cambiar al escribir los nuevos valores).
      const nombreOrig = String(a.nombreOrig ?? a.nombre ?? '');
      const colorOrig = String(a.colorOrig ?? a.color ?? '');

      const ids = await odooSearchRead(
        'distefano.importacion.rollo',
        [
          ['importacion_id', '=', importacionId],
          ['nombre', '=', nombreOrig],
          ['color', '=', colorOrig],
        ],
        ['id'],
        MAX,
      );
      if (!ids.length) {
        noActualizados.push(nombreOrig || colorOrig || '(artículo sin nombre)');
        continue;
      }

      const vals = {};
      if (a.codigo !== undefined) vals.cod_dist = String(a.codigo || '');
      if (a.color !== undefined) vals.color = String(a.color || '');
      if (a.composicion !== undefined) vals.composicion = String(a.composicion || '');
      if (a.nombre !== undefined) vals.nombre = String(a.nombre || '');
      if (!Object.keys(vals).length) continue;

      await odooKw('distefano.importacion.rollo', 'write', [ids.map((x) => x.id), vals]);
      actualizados += ids.length;
    }

    return respond({
      status: noActualizados.length ? 'warning' : 'success',
      msg: noActualizados.length
        ? `Actualizados ${actualizados} rollo(s). No se encontró: ${noActualizados.join(', ')} (recarga e inténtalo de nuevo).`
        : `Datos de artículo actualizados en ${actualizados} rollo(s).`,
      detalles: { actualizados, noActualizados },
    });
  } catch (err) {
    return failOdoo(err);
  }
}
