// Emulación in-memory del contrato Odoo (§2 del plan) para desarrollar sin
// servidor real. Se activa con ODOO_FAKE=1 (odoo.js desvía cada función
// exportada hacia aquí). Mismas validaciones y mensajes que el módulo Python
// (rollo.py, a cargo del Agente A) para que el frontend (Agente C) se pruebe
// de forma realista.
//
// Estado en variables de módulo: Node cachea el módulo en el primer
// require('./fakeOdoo'), así que estos arrays persisten mientras corre el
// dev server (se reinician solo al reiniciar `next dev`).
import { normalizarBarcode } from './barcode';

// ------------------------------------------------------------------
// Utilidades de fecha (GMT-6 fijo, igual que el backend Odoo real / GAS —
// test.md usa Utilities.formatDate(d, "GMT-6", ...) para "hoy").
// ------------------------------------------------------------------
function pad(n) {
  return String(n).padStart(2, '0');
}

function toOdooDatetime(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`;
}

function hoyGMT6(d = new Date()) {
  const shifted = new Date(d.getTime() - 6 * 3600 * 1000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

function soloFecha(datetimeStr) {
  return datetimeStr ? String(datetimeStr).slice(0, 10) : '';
}

function fmt2(n) {
  const num = Number(n);
  return (isNaN(num) ? 0 : num).toFixed(2);
}

// ------------------------------------------------------------------
// Estado en memoria — singleton sobre globalThis.
//
// IMPORTANTE: no puede ser una variable de módulo suelta. En `next dev` cada
// ruta API se compila en un bundle SEPARADO, y cada bundle instancia su
// propia copia de este módulo: un scan por /api/odoo/scan mutaría una copia
// que /api/odoo/scan/undo nunca vería (cada una con su propio seed).
// `globalThis` es compartido por todos los bundles del mismo proceso Node,
// así que todas las rutas leen/mutan el MISMO objeto. Todas las funciones de
// este archivo referencian `state` (este singleton), nunca variables sueltas.
// ------------------------------------------------------------------
function buildState() {
  return {
    seeded: false,
    nextImportacionId: 1,
    nextRolloId: 1,
    nextEventoId: 1,
    nextPartnerId: 1,
    importaciones: [],
    rollos: [],
    eventos: [],
    partners: [],
  };
}

const state = globalThis.__fakeOdooState || (globalThis.__fakeOdooState = buildState());

function findRolloByBarcode(barcode) {
  return state.rollos.find((r) => r.barcode === barcode);
}

function evento(rollo, fase, origen, destino, source, operador) {
  return {
    id: state.nextEventoId++,
    rollo_id: rollo.id,
    importacion_id: rollo.importacion_id,
    fase,
    estado_origen: origen,
    estado_destino: destino,
    source: source || 'manual',
    operador: operador || false,
    fecha: toOdooDatetime(),
  };
}

// ------------------------------------------------------------------
// Seed: 1 expediente + 30 rollos en estados variados (10 pendiente, 8 bodega,
// 5 transito con fecha_piloto=hoy, 7 recibido; 3 cod_dist distintos).
// ------------------------------------------------------------------
function seed() {
  if (state.seeded) return;
  state.seeded = true;

  const partner = { id: state.nextPartnerId++, name: 'Proveedor Demo S.A. (FAKE)', supplier: true };
  state.partners.push(partner);

  const imp = {
    id: state.nextImportacionId++,
    name: 'IMP-2026-0001 (FAKE)',
    descripcion: 'Expediente de prueba — datos simulados (ODOO_FAKE=1)',
    partner_origen_id: partner.id,
    origen: 'compra',
    state: 'bodega',
    contenedor: 'MSCU1234567',
    company_id: Number(process.env.ODOO_COMPANY_ID || 1),
  };
  state.importaciones.push(imp);

  const codDistList = ['ALG-100', 'POL-200', 'SED-300'];
  const nombres = ['Popelina', 'Gabardina', 'Seda Charmeuse'];
  const colores = ['Azul Marino', 'Rojo', 'Verde Botella', 'Negro', 'Blanco'];
  const hoy = hoyGMT6();

  function crearRollo(n, cod_dist) {
    return {
      id: state.nextRolloId++,
      importacion_id: imp.id,
      pieza: String(n),
      cod_dist,
      nombre: nombres[n % nombres.length],
      color: colores[n % colores.length],
      composicion: '100% ' + (n % 2 === 0 ? 'Algodón' : 'Poliéster'),
      barcode: `ROLLO${String(n).padStart(3, '0')}`, // 8 chars: >=7 y <10, sin recorte al escanear
      peso_neto: 10 + (n % 7),
      metros: 50 + (n % 20),
      yardas: Number(((50 + (n % 20)) * 1.09361).toFixed(2)),
      estado: 'pendiente',
      extra_info: '',
      fecha_z14: false,
      fecha_piloto: false,
      fecha_xena: false,
      operador_z14: false,
      operador_piloto: false,
      operador_xena: false,
    };
  }

  function avanzarABodega(rollo) {
    rollo.estado = 'bodega';
    rollo.fecha_z14 = toOdooDatetime();
    rollo.operador_z14 = 'Seed Z14';
    state.eventos.push(evento(rollo, 'ingreso', 'pendiente', 'bodega', 'upload', 'Seed Z14'));
  }

  function avanzarATransito(rollo, fechaPilotoHoy) {
    rollo.estado = 'transito';
    rollo.operador_piloto = 'Seed Piloto';
    rollo.fecha_piloto = fechaPilotoHoy
      ? `${hoy} ${pad(8 + (rollo.id % 8))}:${pad(rollo.id % 60)}:00`
      : toOdooDatetime();
    state.eventos.push(evento(rollo, 'piloto', 'bodega', 'transito', 'manual', 'Seed Piloto'));
  }

  function avanzarARecibido(rollo) {
    rollo.estado = 'recibido';
    rollo.fecha_xena = toOdooDatetime();
    rollo.operador_xena = 'Seed Xena';
    state.eventos.push(evento(rollo, 'xena', 'transito', 'recibido', 'manual', 'Seed Xena'));
  }

  const plan = [
    ...Array(10).fill('pendiente'),
    ...Array(8).fill('bodega'),
    ...Array(5).fill('transito'),
    ...Array(7).fill('recibido'),
  ];

  plan.forEach((estadoObjetivo, idx) => {
    const n = idx + 1;
    const cod_dist = codDistList[idx % codDistList.length];
    const rollo = crearRollo(n, cod_dist);

    if (estadoObjetivo !== 'pendiente') avanzarABodega(rollo);
    if (estadoObjetivo === 'transito' || estadoObjetivo === 'recibido') avanzarATransito(rollo, true);
    if (estadoObjetivo === 'recibido') avanzarARecibido(rollo);

    state.rollos.push(rollo);
  });
}

// ------------------------------------------------------------------
// Lógica de negocio — mismas reglas/mensajes que rollo.py (§2 del plan)
// ------------------------------------------------------------------
function scanIngreso(barcodeRaw, operador, source) {
  const norm = normalizarBarcode(barcodeRaw);
  if (!norm.ok) return { status: 'error', msg: norm.error, detalles: null };

  const rollo = findRolloByBarcode(norm.codigo);
  if (!rollo) {
    return {
      status: 'error',
      msg: `❌ No encontramos el código "${norm.codigo}" en los Packing Lists.`,
      detalles: null,
    };
  }
  const imp = state.importaciones.find((i) => i.id === rollo.importacion_id);
  if (imp && (imp.state === 'cerrado' || imp.state === 'cancelado')) {
    return {
      status: 'error',
      msg: `El expediente ${imp.name} está cerrado/cancelado; no admite más ingresos.`,
      detalles: null,
    };
  }
  if (rollo.estado !== 'pendiente') {
    return {
      status: 'warning',
      msg: `⚠️ RECHAZADO: El código ${norm.codigo} ya fue registrado.`,
      detalles: null,
    };
  }

  rollo.estado = 'bodega';
  rollo.fecha_z14 = toOdooDatetime();
  rollo.extra_info = norm.extra || '';
  rollo.operador_z14 = operador || false;
  state.eventos.push(evento(rollo, 'ingreso', 'pendiente', 'bodega', source, operador));

  const hermanos = state.rollos.filter(
    (r) => r.importacion_id === rollo.importacion_id && r.cod_dist === rollo.cod_dist,
  );
  const totalArticulo = hermanos.length;
  const ingresadosArticulo = hermanos.filter((r) => r.estado !== 'pendiente').length;

  const delExpediente = state.rollos.filter((r) => r.importacion_id === rollo.importacion_id);
  const globalTotal = delExpediente.length;
  const globalIngresados = delExpediente.filter((r) => r.estado !== 'pendiente').length;

  return {
    status: 'success',
    msg: 'Ingreso Exitoso en Z14',
    detalles: {
      codigo: norm.codigo,
      estado: 'EN BODEGA',
      pieza: rollo.pieza,
      codigoDist: rollo.cod_dist,
      nombre: rollo.nombre,
      color: rollo.color,
      metros: fmt2(rollo.metros),
      yardas: fmt2(rollo.yardas),
      extraInfo: rollo.extra_info,
      expediente: imp ? imp.name : '',
      ingresadosArticulo,
      totalArticulo,
      globalIngresados,
      globalTotal,
      globalFaltan: globalTotal - globalIngresados,
    },
  };
}

function scanPiloto(barcodeRaw, operador, source) {
  const norm = normalizarBarcode(barcodeRaw);
  if (!norm.ok) return { status: 'error', msg: norm.error, detalles: null };
  const rollo = findRolloByBarcode(norm.codigo);

  if (!rollo || rollo.estado === 'pendiente') {
    return { status: 'error', msg: '❌ RECHAZADO: Este rollo no ha ingresado a la Bodega Z14.', detalles: null };
  }
  if (rollo.estado === 'transito') {
    return { status: 'info', msg: 'Este bulto ya está en camino.', detalles: null };
  }
  if (rollo.estado === 'recibido') {
    return { status: 'info', msg: 'Este bulto ya fue entregado a Xena Coj.', detalles: null };
  }

  rollo.estado = 'transito';
  rollo.fecha_piloto = toOdooDatetime();
  rollo.operador_piloto = operador || false;
  state.eventos.push(evento(rollo, 'piloto', 'bodega', 'transito', source, operador));

  const hoy = hoyGMT6();
  const cargadosHoy = state.rollos.filter(
    (r) => r.estado === 'transito' && soloFecha(r.fecha_piloto) === hoy,
  ).length;
  const imp = state.importaciones.find((i) => i.id === rollo.importacion_id);

  return {
    status: 'success',
    msg: 'Rollo asignado a ruta',
    detalles: {
      codigo: norm.codigo,
      estado: 'EN TRÁNSITO',
      pieza: rollo.pieza,
      codigoDist: rollo.cod_dist,
      nombre: rollo.nombre,
      color: rollo.color,
      metros: fmt2(rollo.metros),
      yardas: fmt2(rollo.yardas),
      expediente: imp ? imp.name : '',
      cargadosHoy,
    },
  };
}

function scanXena(barcodeRaw, operador, source) {
  const norm = normalizarBarcode(barcodeRaw);
  if (!norm.ok) return { status: 'error', msg: norm.error, detalles: null };
  const rollo = findRolloByBarcode(norm.codigo);

  if (rollo && rollo.estado === 'recibido') {
    return { status: 'info', msg: 'Este rollo ya está almacenado aquí.', detalles: null };
  }
  if (!rollo || rollo.estado !== 'transito') {
    return { status: 'error', msg: 'Rechazado. El piloto no reportó tránsito.', detalles: null };
  }

  rollo.estado = 'recibido';
  rollo.fecha_xena = toOdooDatetime();
  rollo.operador_xena = operador || false;
  state.eventos.push(evento(rollo, 'xena', 'transito', 'recibido', source, operador));

  const hoy = hoyGMT6();
  const totalRecibidos = state.rollos.filter((r) => r.estado === 'recibido').length;
  const recibidosHoy = state.rollos.filter(
    (r) => r.estado === 'recibido' && soloFecha(r.fecha_xena) === hoy,
  ).length;
  const imp = state.importaciones.find((i) => i.id === rollo.importacion_id);

  return {
    status: 'success',
    msg: 'Recepción Exitosa',
    detalles: {
      codigo: norm.codigo,
      estado: 'RECIBIDO XENA',
      pieza: rollo.pieza,
      codigoDist: rollo.cod_dist,
      nombre: rollo.nombre,
      color: rollo.color,
      metros: fmt2(rollo.metros),
      yardas: fmt2(rollo.yardas),
      expediente: imp ? imp.name : '',
      totalRecibidos,
      recibidosHoy,
    },
  };
}

const INVERSO = { bodega: 'pendiente', transito: 'bodega', recibido: 'transito' };

function scanUndo(barcodeRaw, operador, estadoEsperado) {
  const norm = normalizarBarcode(barcodeRaw);
  if (!norm.ok) return { status: 'error', msg: norm.error, detalles: null };
  const rollo = findRolloByBarcode(norm.codigo);
  if (!rollo) {
    return { status: 'error', msg: `❌ No encontramos el código "${norm.codigo}".`, detalles: null };
  }
  if (estadoEsperado && rollo.estado !== estadoEsperado) {
    return {
      status: 'error',
      msg: `El estado de este rollo cambió mientras tanto (ahora: ${rollo.estado}). Actualiza la vista.`,
      detalles: null,
    };
  }
  if (rollo.estado === 'pendiente') {
    return { status: 'error', msg: 'Nada que deshacer.', detalles: null };
  }

  const origen = rollo.estado;
  const destino = INVERSO[origen];
  if (destino === 'pendiente') {
    rollo.fecha_z14 = false;
    rollo.operador_z14 = false;
    rollo.extra_info = '';
  } else if (destino === 'bodega') {
    rollo.fecha_piloto = false;
    rollo.operador_piloto = false;
  } else if (destino === 'transito') {
    rollo.fecha_xena = false;
    rollo.operador_xena = false;
  }
  rollo.estado = destino;
  state.eventos.push(evento(rollo, 'undo', origen, destino, 'undo', operador));

  const imp = state.importaciones.find((i) => i.id === rollo.importacion_id);
  return {
    status: 'success',
    msg: `Deshecho: ${rollo.barcode} volvió a ${destino}.`,
    detalles: {
      codigo: rollo.barcode,
      estado: destino,
      pieza: rollo.pieza,
      codigoDist: rollo.cod_dist,
      expediente: imp ? imp.name : '',
    },
  };
}

function cargarRollos(importacionId, rows, operador) {
  const imp = state.importaciones.find((i) => i.id === Number(importacionId));
  if (!imp) {
    return { status: 'error', msg: 'Expediente no encontrado.', detalles: null };
  }
  if (imp.state === 'cerrado' || imp.state === 'cancelado') {
    return {
      status: 'error',
      msg: `El expediente ${imp.name} está cerrado/cancelado; no admite cargas.`,
      detalles: null,
    };
  }

  const vistos = new Set();
  const aCrear = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const barcode = String(row.barcode || '')
      .toUpperCase()
      .replace(/[\r\n\t\s]+/g, '');
    if (!barcode || vistos.has(barcode)) continue;
    vistos.add(barcode);
    aCrear.push({ ...row, barcode });
  }

  const yaExistentes = [];
  let creados = 0;
  for (const row of aCrear) {
    if (findRolloByBarcode(row.barcode)) {
      if (yaExistentes.length < 50) yaExistentes.push(row.barcode);
      continue;
    }
    state.rollos.push({
      id: state.nextRolloId++,
      importacion_id: imp.id,
      pieza: String(row.pieza || ''),
      cod_dist: String(row.cod_dist || ''),
      nombre: String(row.nombre || ''),
      color: String(row.color || ''),
      composicion: String(row.composicion || ''),
      barcode: row.barcode,
      peso_neto: Number(row.peso_neto) || 0,
      metros: Number(row.metros) || 0,
      yardas: Number(row.yardas) || 0,
      estado: 'pendiente',
      extra_info: '',
      fecha_z14: false,
      fecha_piloto: false,
      fecha_xena: false,
      operador_z14: false,
      operador_piloto: false,
      operador_xena: false,
    });
    creados++;
  }

  return {
    status: 'success',
    msg: `${creados} rollos creados en ${imp.name}.`,
    detalles: { creados, yaExistentes, totalRecibidas: Array.isArray(rows) ? rows.length : 0 },
  };
}

function listaTransito(importacionId) {
  let lista = state.rollos.filter((r) => r.estado === 'transito');
  if (importacionId) lista = lista.filter((r) => r.importacion_id === Number(importacionId));
  lista = lista.slice().sort((a, b) => String(a.fecha_piloto || '').localeCompare(String(b.fecha_piloto || '')));

  const rollosOut = lista.map((r) => {
    const imp = state.importaciones.find((i) => i.id === r.importacion_id);
    return {
      codigo: r.barcode,
      pieza: r.pieza,
      codigoDist: r.cod_dist,
      nombre: r.nombre,
      color: r.color,
      metros: fmt2(r.metros),
      yardas: fmt2(r.yardas),
      expediente: imp ? imp.name : '',
    };
  });

  return { status: 'success', msg: '', detalles: { rollos: rollosOut } };
}

function recibirBulk(barcodes, operador) {
  const lista = Array.isArray(barcodes) ? barcodes : [];
  let recibidos = 0;
  const omitidos = [];
  for (const raw of lista) {
    const codigo = String(raw || '')
      .toUpperCase()
      .replace(/[\r\n\t\s]+/g, '');
    const rollo = findRolloByBarcode(codigo);
    if (!rollo || rollo.estado !== 'transito') {
      omitidos.push(codigo);
      continue;
    }
    rollo.estado = 'recibido';
    rollo.fecha_xena = toOdooDatetime();
    rollo.operador_xena = operador || false;
    state.eventos.push(evento(rollo, 'xena', 'transito', 'recibido', 'bulk', operador));
    recibidos++;
  }

  return {
    status: recibidos > 0 ? 'success' : 'warning',
    msg:
      recibidos > 0
        ? `Se recibieron correctamente ${recibidos} bultos en la bodega Xena Coj.`
        : 'No se recibió ningún bulto (ya estaban recibidos o no existen).',
    detalles: { recibidos, omitidos },
  };
}

function dashboardData(importacionId) {
  let base = state.rollos;
  if (importacionId) base = base.filter((r) => r.importacion_id === Number(importacionId));

  const hoy = hoyGMT6();
  const stats = {
    enBodegaZ14: base.filter((r) => r.estado === 'bodega').length,
    enviadosHoy: base.filter((r) => r.estado === 'transito' && soloFecha(r.fecha_piloto) === hoy).length,
    recibidosHoyXena: base.filter((r) => r.estado === 'recibido' && soloFecha(r.fecha_xena) === hoy).length,
    totalXena: base.filter((r) => r.estado === 'recibido').length,
    pendientes: base.filter((r) => r.estado === 'pendiente').length,
    total: base.length,
  };

  const rows = base
    .filter((r) => r.estado !== 'pendiente')
    .slice()
    .sort((a, b) => b.id - a.id)
    .slice(0, 1000)
    .map((r) => {
      const imp = state.importaciones.find((i) => i.id === r.importacion_id);
      return {
        id: r.id,
        codigo: r.barcode,
        codigoDist: r.cod_dist,
        nombre: r.nombre,
        metros: fmt2(r.metros),
        yardas: fmt2(r.yardas),
        estado: r.estado,
        expediente: imp ? imp.name : '',
      };
    });

  return { status: 'success', msg: '', detalles: { stats, rows } };
}

function manifiestoData(fecha) {
  const objetivo = fecha || hoyGMT6();
  const lista = state.rollos.filter((r) => r.estado === 'transito' && soloFecha(r.fecha_piloto) === objetivo);

  if (!lista.length) {
    return {
      status: 'info',
      msg: 'No hay rollos cargados en tránsito ese día.',
      detalles: { fecha: objetivo, rows: [], totales: { peso: '0.00', metros: '0.00', yardas: '0.00', rollos: 0 } },
    };
  }

  let peso = 0;
  let metros = 0;
  let yardas = 0;
  const rows = lista.map((r) => {
    peso += r.peso_neto;
    metros += r.metros;
    yardas += r.yardas;
    const imp = state.importaciones.find((i) => i.id === r.importacion_id);
    return {
      pieza: r.pieza,
      codigoDist: r.cod_dist,
      nombre: r.nombre,
      color: r.color,
      composicion: r.composicion,
      barcode: r.barcode,
      pesoNeto: fmt2(r.peso_neto),
      metros: fmt2(r.metros),
      yardas: fmt2(r.yardas),
      expediente: imp ? imp.name : '',
    };
  });

  return {
    status: 'success',
    msg: '',
    detalles: { fecha: objetivo, rows, totales: { peso: fmt2(peso), metros: fmt2(metros), yardas: fmt2(yardas), rollos: rows.length } },
  };
}

// ------------------------------------------------------------------
// Mini-ORM: domain matching estilo Odoo (notación polaca '&'/'|'/'!' con
// leaves [campo, operador, valor]; AND implícito para listas planas de
// leaves). Solo soporta los operadores que las rutas de este proyecto
// realmente usan.
// ------------------------------------------------------------------
function matchLeaf(record, leaf) {
  if (!Array.isArray(leaf) || leaf.length < 3) return true;
  const [field, op, value] = leaf;
  const val = record[field];
  switch (op) {
    case '=':
      return val === value;
    case '!=':
      return val !== value;
    case 'in':
      return Array.isArray(value) && value.includes(val);
    case 'not in':
      return Array.isArray(value) && !value.includes(val);
    case 'like':
    case 'ilike':
      return String(val || '').toLowerCase().includes(String(value || '').toLowerCase());
    case 'not ilike':
      return !String(val || '').toLowerCase().includes(String(value || '').toLowerCase());
    case '>':
      return val > value;
    case '<':
      return val < value;
    case '>=':
      return val >= value;
    case '<=':
      return val <= value;
    default:
      return true;
  }
}

function matchDomain(record, domain) {
  if (!domain || !domain.length) return true;
  const stack = [];
  for (let i = domain.length - 1; i >= 0; i--) {
    const tok = domain[i];
    if (tok === '&') {
      const a = stack.pop();
      const b = stack.pop();
      stack.push(Boolean(a) && Boolean(b));
    } else if (tok === '|') {
      const a = stack.pop();
      const b = stack.pop();
      stack.push(Boolean(a) || Boolean(b));
    } else if (tok === '!') {
      const a = stack.pop();
      stack.push(!a);
    } else {
      stack.push(matchLeaf(record, tok));
    }
  }
  return stack.every(Boolean);
}

function tableForModel(model) {
  if (model === 'distefano.importacion') return state.importaciones;
  if (model === 'distefano.importacion.rollo') return state.rollos;
  if (model === 'distefano.importacion.rollo.evento') return state.eventos;
  if (model === 'res.partner') return state.partners;
  return null;
}

// Campos many2one: se serializan como [id, label] igual que Odoo (_rec_name).
const REL_FIELDS = {
  importacion_id: { table: 'importaciones', label: 'name' },
  rollo_id: { table: 'rollos', label: 'barcode' },
  partner_origen_id: { table: 'partners', label: 'name' },
};

function projectRecord(record, fields) {
  const keys = fields && fields.length ? fields : Object.keys(record).filter((k) => k !== 'id');
  const out = { id: record.id };
  for (const f of keys) {
    const relInfo = REL_FIELDS[f];
    if (relInfo) {
      const relId = record[f];
      const rel = relId ? state[relInfo.table].find((x) => x.id === relId) : null;
      out[f] = rel ? [rel.id, rel[relInfo.label]] : false;
    } else {
      out[f] = record[f] === undefined ? false : record[f];
    }
  }
  return out;
}

function applyOrder(rows, order) {
  if (!order) return rows;
  const parts = String(order)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const sorted = rows.slice();
  sorted.sort((a, b) => {
    for (const part of parts) {
      const [field, dir] = part.split(/\s+/);
      const desc = (dir || '').toLowerCase() === 'desc';
      let av = a[field];
      let bv = b[field];
      if (av === false || av == null) av = '';
      if (bv === false || bv == null) bv = '';
      if (av < bv) return desc ? 1 : -1;
      if (av > bv) return desc ? -1 : 1;
    }
    return 0;
  });
  return sorted;
}

// ------------------------------------------------------------------
// Interfaz pública — MISMA firma que src/lib/odoo.js
// ------------------------------------------------------------------
export async function odooSearchRead(model, domain = [], fields = [], limit = 80, offset = 0, order = null) {
  seed();
  const table = tableForModel(model);
  if (!table) return [];
  let rows = table.filter((r) => matchDomain(r, domain));
  if (order) rows = applyOrder(rows, order);
  if (offset) rows = rows.slice(offset);
  if (limit) rows = rows.slice(0, limit);
  return rows.map((r) => projectRecord(r, fields));
}

export async function odooSearchCount(model, domain = []) {
  seed();
  const table = tableForModel(model);
  if (!table) return 0;
  return table.filter((r) => matchDomain(r, domain)).length;
}

export async function odooCreate(model, vals = {}) {
  seed();
  if (model === 'distefano.importacion') {
    const id = state.nextImportacionId++;
    const rec = {
      id,
      name: vals.name && vals.name !== '/' ? vals.name : `IMP-${new Date().getFullYear()}-${String(id).padStart(4, '0')} (FAKE)`,
      descripcion: vals.descripcion || '',
      partner_origen_id: vals.partner_origen_id || false,
      origen: vals.origen || 'compra',
      state: vals.state || 'borrador',
      contenedor: vals.contenedor || '',
      company_id: vals.company_id || Number(process.env.ODOO_COMPANY_ID || 1),
    };
    state.importaciones.push(rec);
    return id;
  }
  if (model === 'res.partner') {
    const id = state.nextPartnerId++;
    const rec = { id, name: vals.name || '', supplier: vals.supplier !== undefined ? vals.supplier : true };
    state.partners.push(rec);
    return id;
  }
  throw new Error(`fakeOdoo: create no soportado para el modelo "${model}"`);
}

export async function odooKw(model, method, args = []) {
  seed();
  if (model === 'distefano.importacion.rollo') {
    switch (method) {
      case 'scan_ingreso':
        return scanIngreso(args[0], args[1], args[2] || 'manual');
      case 'scan_piloto':
        return scanPiloto(args[0], args[1], args[2] || 'manual');
      case 'scan_xena':
        return scanXena(args[0], args[1], args[2] || 'manual');
      case 'scan_undo':
        return scanUndo(args[0], args[1], args[2]);
      case 'cargar_rollos':
        return cargarRollos(args[0], args[1], args[2]);
      case 'lista_transito':
        return listaTransito(args[0]);
      case 'recibir_bulk':
        return recibirBulk(args[0], args[1]);
      case 'dashboard_data':
        return dashboardData(args[0]);
      case 'manifiesto_data':
        return manifiestoData(args[0]);
      default:
        throw new Error(`fakeOdoo: método no soportado ${model}.${method}`);
    }
  }
  throw new Error(`fakeOdoo: modelo/método no soportado ${model}.${method}`);
}

// Login demo (ODOO_FAKE=1): acepta admin/admin, o cualquier login no vacío con
// password "demo". Devuelve uid 1 (o false si no matchea).
export async function odooAuthenticate(login, password) {
  const l = String(login || '').trim();
  const p = String(password || '');
  if (!l) return false;
  if ((l.toLowerCase() === 'admin' && p === 'admin') || p === 'demo') return 1;
  return false;
}

// En modo demo todos los usuarios están autorizados.
export async function odooUserInAnyGroup() {
  return true;
}

export async function pingOdoo() {
  seed();
  return {
    ok: true,
    uid: 1,
    latencyMs: 5,
    db: `${process.env.ODOO_DB || 'FAKE'} (ODOO_FAKE=1)`,
  };
}
