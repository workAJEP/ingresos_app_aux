#!/usr/bin/env node
// =======================================================================
// test-rpc.mjs — Prueba de integración contra Odoo REAL (§7.3 del plan).
//
// Ejercita TODO el contrato Agente A <-> Agente B (§2 del plan) llamando
// directamente src/lib/odoo.js (odooKw / odooCreate / odooSearchRead).
// Crea un expediente de prueba "PRUEBA ROLLOS — NO USAR", carga 5 rollos
// ZZTEST001..ZZTEST005, ejercita ingreso/piloto/xena/undo/recibir_bulk/
// dashboard/manifiesto y limpia todo al final (rollos + eventos +
// expediente). NO se ejecuta automáticamente: correr con
// `node scripts/test-rpc.mjs` (o `npm run test:rpc`) solo cuando haya un
// .env.local real apuntando a Odoo.
//
// Imprime PASS/FAIL por caso y termina con exit code 1 si algo falló.
// =======================================================================

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// -----------------------------------------------------------------------
// 1. Cargar .env.local a mano (sin dependencia dotenv): KEY=VALUE por
//    línea, ignora comentarios (#) y líneas vacías, respeta comillas.
// -----------------------------------------------------------------------
function cargarEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!existsSync(envPath)) {
    console.error('[test-rpc] Falta .env.local en la raíz del proyecto. Copia .env.example y completa las credenciales de Odoo.');
    process.exit(1);
  }
  const contenido = readFileSync(envPath, 'utf8');
  for (const lineaRaw of contenido.split(/\r?\n/)) {
    const linea = lineaRaw.trim();
    if (!linea || linea.startsWith('#')) continue;
    const idx = linea.indexOf('=');
    if (idx === -1) continue;
    const key = linea.slice(0, idx).trim();
    let value = linea.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) process.env[key] = value;
  }
}

cargarEnvLocal();

if (process.env.ODOO_FAKE === '1') {
  console.error('[test-rpc] ODOO_FAKE=1: este script prueba Odoo REAL. Pon ODOO_FAKE=0 en .env.local para correrlo.');
  process.exit(1);
}

// -----------------------------------------------------------------------
// 2. Import dinámico DESPUÉS de cargar el .env.local (lib/odoo.js lee
//    process.env al inicializar el cliente XML-RPC).
// -----------------------------------------------------------------------
const odooLibPath = path.join(ROOT, 'src', 'lib', 'odoo.js');
if (!existsSync(odooLibPath)) {
  console.error('[test-rpc] No existe src/lib/odoo.js todavía (lo crea el Agente B). Nada que probar.');
  process.exit(1);
}
const { odooKw, odooCreate, odooSearchRead } = await import(odooLibPath);

// -----------------------------------------------------------------------
// 3. Utilidades de test
// -----------------------------------------------------------------------
const RESULTADOS = [];
let falloAlgo = false;

function assert(cond, etiqueta, extra) {
  const ok = Boolean(cond);
  if (!ok) falloAlgo = true;
  RESULTADOS.push({ ok, etiqueta });
  const marca = ok ? 'PASS' : 'FAIL';
  console.log('[%s] %s%s', marca, etiqueta, extra ? '  ' + JSON.stringify(extra) : '');
  return ok;
}

function resumenFinal() {
  const total = RESULTADOS.length;
  const ok = RESULTADOS.filter((r) => r.ok).length;
  console.log('\n=======================================================');
  console.log('  %d/%d casos OK', ok, total);
  console.log(falloAlgo ? '  RESULTADO: FAIL' : '  RESULTADO: PASS');
  console.log('=======================================================\n');
}

const MODEL_ROLLO = 'distefano.importacion.rollo';
const MODEL_EVENTO = 'distefano.importacion.rollo.evento';
const MODEL_IMPORTACION = 'distefano.importacion';
const OPERADOR = 'test-rpc';

// Barcodes de prueba. Se suben con 9 caracteres (< 10) para que un scan
// directo NO dispare el recorte de extra_info (_normalizar solo recorta
// los últimos 2 caracteres cuando el código escaneado mide >= 10). Para
// probar extra_info específicamente se escanea ZZTEST001 + 2 caracteres
// extra ("XY") = 11 caracteres, que la normalización recorta a los 9
// originales + extra = 'XY' (ver model/rollo.py _normalizar).
const BARCODES = ['ZZTEST001', 'ZZTEST002', 'ZZTEST003', 'ZZTEST004', 'ZZTEST005'];

function filaRollo(barcode, i) {
  return {
    pieza: (i + 1) + '/5',
    cod_dist: 'DIST-ZZTEST',
    nombre: 'Tela de prueba ' + barcode,
    color: 'Azul',
    composicion: '100% ALGODON',
    barcode: barcode,
    peso_neto: 10.5 + i,
    metros: 50.25 + i,
    yardas: 54.95 + i,
  };
}

// -----------------------------------------------------------------------
// 4. Flujo principal
// -----------------------------------------------------------------------
let importacionId = null;

async function crearExpedientePrueba() {
  const companyId = Number(process.env.ODOO_COMPANY_ID || 1);
  const id = await odooCreate(MODEL_IMPORTACION, {
    descripcion: 'PRUEBA ROLLOS — NO USAR',
    origen: 'compra',
    company_id: companyId,
  });
  assert(Number.isInteger(id) && id > 0, 'crear expediente de prueba', { id });
  return id;
}

async function limpiar() {
  console.log('\n--- Limpieza ---');
  try {
    if (importacionId) {
      const eventoIds = await odooKw(MODEL_EVENTO, 'search', [[['importacion_id', '=', importacionId]]]);
      if (eventoIds && eventoIds.length) {
        await odooKw(MODEL_EVENTO, 'unlink', [eventoIds]);
      }
      const rolloIds = await odooKw(MODEL_ROLLO, 'search', [[['importacion_id', '=', importacionId]]]);
      if (rolloIds && rolloIds.length) {
        await odooKw(MODEL_ROLLO, 'unlink', [rolloIds]);
      }
      await odooKw(MODEL_IMPORTACION, 'unlink', [[importacionId]]);
      console.log('Limpieza OK: expediente %d + rollos + eventos eliminados.', importacionId);
    }
  } catch (err) {
    console.error('[test-rpc] ADVERTENCIA: fallo durante la limpieza:', err && err.message ? err.message : err);
    console.error('Revisa manualmente el expediente "PRUEBA ROLLOS — NO USAR" en Odoo.');
  }
}

async function run() {
  console.log('=== test-rpc: contrato Agente A (Odoo) <-> Agente B (Next.js) ===\n');

  // 1) Expediente de prueba
  importacionId = await crearExpedientePrueba();

  // 2) cargar_rollos — 5 filas
  const filas = BARCODES.map(filaRollo);
  const cargaRes = await odooKw(MODEL_ROLLO, 'cargar_rollos', [importacionId, filas, OPERADOR]);
  assert(cargaRes && cargaRes.status === 'success', 'cargar_rollos: status success', cargaRes);
  assert(cargaRes && cargaRes.detalles && cargaRes.detalles.creados === 5,
    'cargar_rollos: 5 creados', cargaRes && cargaRes.detalles);
  assert(cargaRes && cargaRes.detalles && cargaRes.detalles.yaExistentes.length === 0,
    'cargar_rollos: 0 ya existentes', cargaRes && cargaRes.detalles);

  // 3) scan_ingreso con extra_info (barcode de 11 chars = 9 + 2 extra)
  const barcodeConExtra = BARCODES[0] + 'XY';
  const ing1 = await odooKw(MODEL_ROLLO, 'scan_ingreso', [barcodeConExtra, OPERADOR, 'manual']);
  assert(ing1 && ing1.status === 'success', 'scan_ingreso: ok', ing1);
  assert(ing1 && ing1.detalles && ing1.detalles.codigo === BARCODES[0],
    'scan_ingreso: codigo normalizado sin el extra', ing1 && ing1.detalles);
  assert(ing1 && ing1.detalles && ing1.detalles.extraInfo === 'XY',
    'scan_ingreso: extra_info capturado ("XY")', ing1 && ing1.detalles);
  assert(ing1 && ing1.detalles && ing1.detalles.estado === 'EN BODEGA',
    'scan_ingreso: estado EN BODEGA', ing1 && ing1.detalles);

  // 4) scan_ingreso duplicado -> warning
  const ing1dup = await odooKw(MODEL_ROLLO, 'scan_ingreso', [barcodeConExtra, OPERADOR, 'manual']);
  assert(ing1dup && ing1dup.status === 'warning', 'scan_ingreso duplicado: warning', ing1dup);

  // 5) scan_piloto ok + cargadosHoy >= 1
  const piloto1 = await odooKw(MODEL_ROLLO, 'scan_piloto', [BARCODES[0], OPERADOR, 'manual']);
  assert(piloto1 && piloto1.status === 'success', 'scan_piloto: ok', piloto1);
  assert(piloto1 && piloto1.detalles && piloto1.detalles.cargadosHoy >= 1,
    'scan_piloto: cargadosHoy >= 1', piloto1 && piloto1.detalles);

  // 6) scan_piloto repetido -> info
  const piloto1rep = await odooKw(MODEL_ROLLO, 'scan_piloto', [BARCODES[0], OPERADOR, 'manual']);
  assert(piloto1rep && piloto1rep.status === 'info', 'scan_piloto repetido: info', piloto1rep);

  // 7) scan_xena sin tránsito (rollo 2 sigue pendiente) -> error
  const xenaSinTransito = await odooKw(MODEL_ROLLO, 'scan_xena', [BARCODES[1], OPERADOR, 'manual']);
  assert(xenaSinTransito && xenaSinTransito.status === 'error',
    'scan_xena sin tránsito: error', xenaSinTransito);

  // 8) scan_xena ok (rollo 1, ya en tránsito)
  const xena1 = await odooKw(MODEL_ROLLO, 'scan_xena', [BARCODES[0], OPERADOR, 'manual']);
  assert(xena1 && xena1.status === 'success', 'scan_xena: ok', xena1);
  assert(xena1 && xena1.detalles && xena1.detalles.totalRecibidos >= 1,
    'scan_xena: totalRecibidos >= 1', xena1 && xena1.detalles);

  // 9) scan_undo: deshace la recepción Xena del rollo 1 (recibido -> transito)
  const undo1 = await odooKw(MODEL_ROLLO, 'scan_undo', [BARCODES[0], OPERADOR, 'recibido']);
  assert(undo1 && undo1.status === 'success', 'scan_undo: ok', undo1);
  assert(undo1 && undo1.detalles && undo1.detalles.estado === 'transito',
    'scan_undo: vuelve a transito', undo1 && undo1.detalles);

  // 10) Preparar rollos 2 y 3 para recibir_bulk (ingreso + piloto)
  const ing2 = await odooKw(MODEL_ROLLO, 'scan_ingreso', [BARCODES[1], OPERADOR, 'manual']);
  assert(ing2 && ing2.status === 'success', 'scan_ingreso rollo 2: ok', ing2);
  const ing3 = await odooKw(MODEL_ROLLO, 'scan_ingreso', [BARCODES[2], OPERADOR, 'manual']);
  assert(ing3 && ing3.status === 'success', 'scan_ingreso rollo 3: ok', ing3);
  const pil2 = await odooKw(MODEL_ROLLO, 'scan_piloto', [BARCODES[1], OPERADOR, 'manual']);
  assert(pil2 && pil2.status === 'success', 'scan_piloto rollo 2: ok', pil2);
  const pil3 = await odooKw(MODEL_ROLLO, 'scan_piloto', [BARCODES[2], OPERADOR, 'manual']);
  assert(pil3 && pil3.status === 'success', 'scan_piloto rollo 3: ok', pil3);

  // 11) recibir_bulk: rollos 2 y 3 + un código inexistente (debe omitirse)
  const bulkRes = await odooKw(MODEL_ROLLO, 'recibir_bulk', [[BARCODES[1], BARCODES[2], 'ZZTEST999'], OPERADOR]);
  assert(bulkRes && bulkRes.status === 'success', 'recibir_bulk: status success', bulkRes);
  assert(bulkRes && bulkRes.detalles && bulkRes.detalles.recibidos === 2,
    'recibir_bulk: 2 recibidos', bulkRes && bulkRes.detalles);
  assert(bulkRes && bulkRes.detalles && bulkRes.detalles.omitidos.includes('ZZTEST999'),
    'recibir_bulk: código inexistente omitido', bulkRes && bulkRes.detalles);

  // 12) dashboard_data
  const dash = await odooKw(MODEL_ROLLO, 'dashboard_data', [importacionId]);
  assert(dash && dash.status === 'success', 'dashboard_data: status success', dash);
  assert(dash && dash.detalles && dash.detalles.stats && typeof dash.detalles.stats.total === 'number',
    'dashboard_data: stats.total presente', dash && dash.detalles && dash.detalles.stats);
  assert(dash && dash.detalles && Array.isArray(dash.detalles.rows) && dash.detalles.rows.length >= 3,
    'dashboard_data: rows con al menos 3 filas (rollos ya no pendientes)',
    dash && dash.detalles && { rows: dash.detalles.rows.length });

  // 13) manifiesto_data (hoy): el rollo 1 sigue en tránsito hoy tras el undo
  const manifiesto = await odooKw(MODEL_ROLLO, 'manifiesto_data', []);
  assert(manifiesto && (manifiesto.status === 'success' || manifiesto.status === 'info'),
    'manifiesto_data: responde success o info', manifiesto);
  if (manifiesto && manifiesto.status === 'success') {
    assert(Array.isArray(manifiesto.detalles.rows) && manifiesto.detalles.rows.length >= 1,
      'manifiesto_data: al menos 1 fila en tránsito hoy',
      { rows: manifiesto.detalles.rows.length });
    assert(manifiesto.detalles.totales && manifiesto.detalles.totales.rollos >= 1,
      'manifiesto_data: totales.rollos >= 1', manifiesto.detalles.totales);
  }

  // 14) lista_transito (rollo 1 debe seguir apareciendo)
  const transito = await odooKw(MODEL_ROLLO, 'lista_transito', [importacionId]);
  assert(transito && transito.status === 'success', 'lista_transito: status success', transito);
  const codigosTransito = (transito && transito.detalles && transito.detalles.rollos || []).map((r) => r.codigo);
  assert(codigosTransito.includes(BARCODES[0]),
    'lista_transito: incluye el rollo 1 (en tránsito tras el undo)', codigosTransito);

  // 15) tracking_status del expediente != ''
  const expedientes = await odooSearchRead(
    MODEL_IMPORTACION,
    [['id', '=', importacionId]],
    ['tracking_status', 'tracking_detalle', 'tracking_fecha'],
    1
  );
  const exp = expedientes && expedientes[0];
  assert(exp && typeof exp.tracking_status === 'string' && exp.tracking_status.length > 0,
    'expediente: tracking_status distinto de vacío', exp && exp.tracking_status);
}

try {
  await run();
} catch (err) {
  falloAlgo = true;
  console.error('\n[test-rpc] ERROR NO CONTROLADO:', err);
} finally {
  await limpiar();
  resumenFinal();
  process.exitCode = falloAlgo ? 1 : 0;
}
