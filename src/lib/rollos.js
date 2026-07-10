// Wrappers de los métodos RPC de distefano.importacion.rollo (§2 del plan).
// Cada función valida que la respuesta tenga la forma {status,msg,detalles}
// (dict de negocio) antes de devolverla a la ruta API — si Odoo/fakeOdoo
// devuelven algo inesperado, se lanza para que la ruta lo traduzca a 503
// (failOdoo) en vez de reenviar basura al frontend.
import { odooKw, LOAD_TIMEOUT_MS } from './odoo';

const MODEL = 'distefano.importacion.rollo';
const CHUNK_SIZE = 500;

function assertShape(res, label) {
  if (!res || typeof res !== 'object' || typeof res.status !== 'string') {
    throw new Error(`Respuesta inesperada de Odoo en ${label}: ${JSON.stringify(res)}`);
  }
  return res;
}

const METODO_POR_FASE = {
  ingreso: 'scan_ingreso',
  piloto: 'scan_piloto',
  xena: 'scan_xena',
};

export async function scan(fase, barcode, operador, source = 'manual') {
  const metodo = METODO_POR_FASE[fase];
  if (!metodo) throw new Error(`Fase inválida: ${fase}`);
  const res = await odooKw(MODEL, metodo, [barcode, operador || false, source]);
  return assertShape(res, metodo);
}

export async function scanUndo(barcode, operador, estadoEsperado) {
  const res = await odooKw(MODEL, 'scan_undo', [barcode, operador || false, estadoEsperado || false]);
  return assertShape(res, 'scan_undo');
}

// Envía las filas del packing list en chunks de 500 (§1/§5 del plan: archivos
// grandes → chunks + timeout largo). Agrega los resultados de cada chunk;
// `yaExistentes` se recorta a 50 en total (igual que hace cada chunk
// individualmente del lado de Odoo).
export async function cargarRollos(importacionId, rows, operador) {
  let creados = 0;
  let totalRecibidas = 0;
  const yaExistentes = [];
  let ultimoStatus = 'success';
  let ultimoMsg = '';

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const res = await odooKw(MODEL, 'cargar_rollos', [importacionId, chunk, operador || false], {}, LOAD_TIMEOUT_MS);
    assertShape(res, 'cargar_rollos');
    if (res.status === 'error') {
      throw new Error(res.msg || 'Error al cargar rollos en Odoo.');
    }
    ultimoStatus = res.status;
    ultimoMsg = res.msg;
    const d = res.detalles || {};
    creados += d.creados || 0;
    totalRecibidas += d.totalRecibidas || chunk.length;
    if (Array.isArray(d.yaExistentes)) {
      for (const item of d.yaExistentes) {
        if (yaExistentes.length < 50) yaExistentes.push(item);
      }
    }
  }

  return { status: ultimoStatus, msg: ultimoMsg, creados, yaExistentes, totalRecibidas };
}

export async function listaTransito(importacionId) {
  const res = await odooKw(MODEL, 'lista_transito', [importacionId || false]);
  return assertShape(res, 'lista_transito');
}

export async function recibirBulk(barcodes, operador) {
  const res = await odooKw(MODEL, 'recibir_bulk', [barcodes, operador || false]);
  return assertShape(res, 'recibir_bulk');
}

export async function dashboardData(importacionId) {
  const res = await odooKw(MODEL, 'dashboard_data', [importacionId || false]);
  return assertShape(res, 'dashboard_data');
}

export async function manifiestoData(fecha) {
  const res = await odooKw(MODEL, 'manifiesto_data', [fecha || false]);
  return assertShape(res, 'manifiesto_data');
}
