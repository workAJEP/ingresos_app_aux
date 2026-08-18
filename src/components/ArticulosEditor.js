'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Tags, RotateCcw } from 'lucide-react';
import { apiFetch } from '@/components/useApi';
import Spinner from '@/components/ui/Spinner';
import ErrorBanner from '@/components/ui/ErrorBanner';
import EmptyState from '@/components/ui/EmptyState';

const DEBOUNCE_MS = 300;
const MIN_CHARS_PRODUCTO = 1;

// ¿Parece código de color del proveedor (D1000, 58L, W942, 992) en vez de un
// color legible? Los packing lists traen el código; la etiqueta lleva el nombre.
function esCodigoColor(s) {
  const v = String(s || '').trim();
  if (!v) return true;
  if (/\d/.test(v)) return true;
  return v.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '').length < 3;
}

/**
 * Modal "Datos de etiqueta": completa por artículo (nombre+color) los 3 datos
 * que el packing list del proveedor NO trae y que el sticker necesita
 * (Código Distefano, Color legible, Composición). Se aplica UNA VEZ POR
 * ARTÍCULO a todos los rollos del grupo.
 *
 * Código de tela y Color se SUGIEREN desde Odoo (producto real / colores ya
 * usados); si no hay match, el usuario escribe libremente — última instancia.
 *
 * GET  /api/odoo/articulos?importacionId=<id>
 * POST /api/odoo/articulos  { importacionId, articulos: [{ nombreOrig,
 *      colorOrig, nombre, codigo, color, composicion }] }
 */
// Anchos iniciales (px) de las columnas redimensionables del modal.
const COLS_INICIAL = { nombrePacking: 190, nombre: 180, codigo: 200, descripcion: 240, color: 160, composicion: 220 };
const COL_MIN = 130;
const COL_MAX = 640;

export default function ArticulosEditor({ open, importacionId, expedienteName, onClose, onSaved }) {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [articulos, setArticulos] = useState([]); // [{ nombreOrig, colorOrig, nombre, codigo, descripcion, color, composicion, rollos }]
  // Productos de las ÓRDENES DE COMPRA del expediente: fuente preferida del
  // Código de tela. Los ya elegidos en otra fila desaparecen de la lista.
  const [ocProductos, setOcProductos] = useState([]);
  // Columnas redimensionables: se arrastra el borde derecho de cada encabezado.
  const [cols, setCols] = useState(COLS_INICIAL);
  const [menuRevertir, setMenuRevertir] = useState(false);
  const dragRef = useRef(null);
  // Snapshot de los artículos tal como se cargaron (estado inicial del modal).
  const inicialRef = useRef([]);

  const startResize = (key) => (e) => {
    e.preventDefault();
    dragRef.current = { key, startX: e.clientX, startW: cols[key] };
    const move = (ev) => {
      const d = ev.clientX - dragRef.current.startX;
      setCols((prev) => ({
        ...prev,
        [dragRef.current.key]: Math.max(COL_MIN, Math.min(COL_MAX, dragRef.current.startW + d)),
      }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // La misma plantilla de grid para encabezado y filas, vía CSS var (--cols-et):
  // así el inline style no rompe el apilado de 1 columna en móvil.
  const gridTemplate = `${cols.nombrePacking}px ${cols.nombre}px ${cols.codigo}px ${cols.descripcion}px ${cols.color}px ${cols.composicion}px 80px`;

  // Carga (o recarga) los artículos del expediente. La usa el efecto de
  // apertura y el botón "Revertir": revertir = descartar lo editado en el
  // formulario y volver a lo que está guardado en Odoo.
  const cargarArticulos = async () => {
    setCargando(true);
    setError('');
    setMsg('');
    const res = await apiFetch(`/api/odoo/articulos?importacionId=${importacionId}`);
    if (res.status === 'error') {
      setError(res.msg);
      setArticulos([]);
      setOcProductos([]);
      inicialRef.current = [];
    } else {
      const lista = res.detalles?.articulos || [];
      setOcProductos(res.detalles?.ocProductos || []);
      const mapeados = lista.map((a) => ({
        nombreOrig: a.nombre || '',
        colorOrig: a.color || '',
        // Nombre del PACKING LIST: no cambia nunca (columna informativa fija).
        nombrePacking: a.nombre || '',
        nombre: a.nombre || '',
        codigo: a.codigo || '',
        descripcion: '',
        // El color del packing list es el CÓDIGO del proveedor (D1000, 58L):
        // no sirve para la etiqueta. Se deja el campo vacío para que el
        // usuario elija el color legible del catálogo Distefano.
        color: esCodigoColor(a.color) ? '' : a.color || '',
        composicion: a.composicion || '',
        rollos: a.rollos || 0,
      }));
      setArticulos(mapeados);
      // Snapshot del estado inicial para Revertir (todo o una fila).
      inicialRef.current = mapeados.map((m) => ({ ...m }));
    }
    setCargando(false);
  };

  const revertirTodo = () => {
    setArticulos(inicialRef.current.map((m) => ({ ...m })));
    setMenuRevertir(false);
  };

  const revertirFila = (idx) => {
    const ini = inicialRef.current[idx];
    if (ini) setArticulos((prev) => prev.map((a, i) => (i === idx ? { ...ini } : a)));
    setMenuRevertir(false);
  };

  useEffect(() => {
    if (!open || !importacionId) return;
    cargarArticulos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, importacionId]);

  if (!open) return null;

  const cerrar = () => {
    setError('');
    setMsg('');
    onClose?.();
  };

  const actualizarArticulo = (idx, cambios) => {
    setArticulos((prev) => prev.map((a, i) => (i === idx ? { ...a, ...cambios } : a)));
  };

  const guardar = async () => {
    setError('');
    setMsg('');
    setGuardando(true);
    const res = await apiFetch('/api/odoo/articulos', {
      method: 'POST',
      body: {
        importacionId,
        articulos: articulos.map((a) => ({
          nombreOrig: a.nombreOrig,
          colorOrig: a.colorOrig,
          nombre: a.nombre,
          codigo: a.codigo,
          color: a.color,
          composicion: a.composicion,
        })),
      },
    });
    setGuardando(false);
    if (res.status === 'error') {
      setError(res.msg);
      return;
    }
    if (res.detalles?.noActualizados?.length) {
      // Algunos artículos no matchearon ningún rollo (grupo cambió entre el
      // GET y el POST) — se avisa explícito en vez de cerrar como si todo
      // hubiera quedado bien; el usuario puede reabrir y reintentar esos.
      setError(res.msg);
      onSaved?.();
      return;
    }
    setMsg(res.msg);
    onSaved?.();
    cerrar();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-xl border border-slate-200 p-6 w-[96vw] max-w-[1250px] shadow-xl max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h3 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
            <Tags className="w-5 h-5 text-blue-700" aria-hidden="true" />
            Datos de etiqueta{expedienteName ? ` · ${expedienteName}` : ''}
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuRevertir((v) => !v)}
                disabled={cargando || guardando}
                title="Descarta lo editado y vuelve al estado inicial"
                className="flex items-center gap-1.5 text-sm font-semibold text-blue-800 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                Revertir
              </button>
              {menuRevertir && (
                <div className="absolute right-0 top-full mt-1 z-40 w-72 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                  <button
                    type="button"
                    onClick={revertirTodo}
                    className="w-full text-left px-3 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-50"
                  >
                    Revertir todo
                  </button>
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase text-slate-400 border-t border-slate-100">
                    O solo una fila
                  </p>
                  {articulos.map((a, i) => (
                    <button
                      key={`${a.nombreOrig}|${a.colorOrig}`}
                      type="button"
                      onClick={() => revertirFila(i)}
                      className="w-full text-left px-3 py-1.5 text-sm text-blue-900 hover:bg-blue-50 truncate"
                      title={a.nombrePacking}
                    >
                      {a.nombrePacking || '(sin nombre)'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar"
              className="p-1.5 rounded text-blue-700 hover:bg-blue-50 transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <p className="text-sm text-slate-500 mb-4 shrink-0">
          Estos datos van en la etiqueta y no vienen en el packing list. Código de tela y Color se sugieren
          desde Odoo — si no aparece el que buscas, escríbelo directamente.
        </p>

        {error && <ErrorBanner message={error} className="mb-3 shrink-0" />}
        {msg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3 shrink-0">{msg}</p>}

        <div className="flex-1 overflow-y-auto overflow-x-auto -mx-1 px-1" style={{ '--cols-et': gridTemplate }}>
          {cargando ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : articulos.length === 0 ? (
            <EmptyState title="Sin artículos" description="Este expediente no tiene rollos cargados." />
          ) : (
            <div className="space-y-3">
              {/* Encabezado solo visible en sm+ (vista tipo tabla). Cada columna
                  se redimensiona arrastrando su borde derecho. */}
              <div className="hidden sm:grid sm:grid-cols-[var(--cols-et)] gap-2 px-1 text-[11px] font-semibold uppercase text-blue-700 sm:w-max sm:min-w-full select-none">
                {[
                  ['nombrePacking', 'Nombre Packing'],
                  ['nombre', 'Nombre'],
                  ['codigo', 'Código de tela'],
                  ['descripcion', 'Descripción'],
                  ['color', 'Color'],
                  ['composicion', 'Composición'],
                ].map(([key, label]) => (
                  <span key={key} className="relative pr-3">
                    {label}
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      onPointerDown={startResize(key)}
                      title="Arrastra para cambiar el ancho"
                      className="absolute -right-1 top-1/2 -translate-y-1/2 h-5 w-2.5 cursor-col-resize flex items-center justify-center"
                    >
                      <span className="h-full w-px bg-slate-300" />
                    </span>
                  </span>
                ))}
                <span className="text-right">Rollos</span>
              </div>

              {articulos.map((a, idx) => (
                <ArticuloRow
                  key={`${a.nombreOrig}|${a.colorOrig}`}
                  articulo={a}
                  onChange={(cambios) => actualizarArticulo(idx, cambios)}
                  ocProductos={ocProductos}
                  // Códigos ya elegidos en OTRAS filas: desaparecen de las
                  // sugerencias de esta (string estable para el useEffect).
                  codigosUsados={articulos
                    .filter((_, i) => i !== idx)
                    .map((x) => String(x.codigo || '').trim().toLowerCase())
                    .filter(Boolean)
                    .join('\n')}
                />
              ))}
            </div>
          )}
        </div>

        {articulos.length > 0 && (
          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-200 shrink-0">
            <button
              type="button"
              onClick={cerrar}
              className="px-4 py-2 text-sm text-blue-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || cargando}
              className="px-4 py-2 text-sm text-white bg-blue-800 hover:bg-blue-900 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {guardando && <Spinner size="sm" className="text-white" />}
              Guardar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Fila de un artículo. Código de tela busca product.product (categoría Telas)
// por default_code/nombre; al ELEGIR una sugerencia se recolocan Nombre,
// Composición y Color con lo que la tela de Odoo tenga (pisa lo que hubiera —
// elegir de la lista es explícito). Color sugiere colores YA USADOS en otros
// rollos (más frecuentes primero). Los desplegables son propios (no <datalist>
// nativo, que se ve negro y sin estilo): si no hay match, el usuario escribe
// libremente y eso es lo que se guarda — Odoo es solo la sugerencia.
function ArticuloRow({ articulo: a, onChange, ocProductos = [], codigosUsados = '' }) {
  const [productos, setProductos] = useState([]);
  const [colores, setColores] = useState([]);
  const prodTimer = useRef(null);
  const colorTimer = useRef(null);

  useEffect(() => {
    clearTimeout(prodTimer.current);
    const q = a.codigo.trim();

    // 1) Con OC: sugerir SOLO los productos de la orden de compra que aún no
    //    fueron elegidos en otra fila (si la OC trae 10 códigos y ya se usó 1,
    //    quedan 9). Se filtra en cliente; sin query se muestran todos los
    //    disponibles al enfocar el campo.
    if (ocProductos.length) {
      const usados = new Set(codigosUsados.split('\n').filter(Boolean));
      const ql = q.toLowerCase();
      const disponibles = ocProductos.filter(
        (p) => !usados.has(String(p.codigo || p.nombre || '').trim().toLowerCase()),
      );
      const filtrados = ql
        ? disponibles.filter(
            (p) =>
              String(p.codigo || '').toLowerCase().includes(ql) ||
              String(p.nombreCompleto || p.nombre || '').toLowerCase().includes(ql),
          )
        : disponibles;
      // Con OC las sugerencias son SOLO de la OC: aunque el código/descripción
      // exista en el catálogo, si no está en la orden de compra NO se sugiere
      // (evita equivocaciones). Sin match la lista queda vacía; siempre se
      // puede escribir el código a mano.
      setProductos(filtrados);
      return undefined;
    }

    // 2) Sin OC en el expediente: búsqueda libre en el catálogo Telas.
    if (q.length < MIN_CHARS_PRODUCTO) {
      setProductos([]);
      return undefined;
    }
    prodTimer.current = setTimeout(async () => {
      const res = await apiFetch(`/api/odoo/productos?q=${encodeURIComponent(q)}`);
      if (res.status === 'success') setProductos(res.detalles?.productos || []);
    }, DEBOUNCE_MS);
    return () => clearTimeout(prodTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.codigo, ocProductos, codigosUsados]);

  useEffect(() => {
    clearTimeout(colorTimer.current);
    colorTimer.current = setTimeout(async () => {
      const res = await apiFetch(`/api/odoo/colores?q=${encodeURIComponent(a.color.trim())}`);
      if (res.status === 'success') setColores(res.detalles?.colores || []);
    }, DEBOUNCE_MS);
    return () => clearTimeout(colorTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.color]);

  const elegirProducto = (p) => {
    // Elegir un código LIMPIA los textos sugeridos del packing (nombre/color del
    // proveedor) y llena solo con lo que la tela de Odoo tenga. Si el producto no
    // trae el dato, el campo queda VACÍO para escribirlo — no se arrastra el texto
    // por default del proveedor (que no corresponde a la etiqueta).
    onChange({
      codigo: p.codigo || p.nombre,
      nombre: p.nombre || '',
      descripcion: p.nombreCompleto || '', // descripción completa del producto de Odoo
      composicion: p.composicion || '',
      color: p.color || '',
    });
  };

  return (
    <div className="border border-slate-200 rounded-lg p-3 sm:p-2 grid grid-cols-1 sm:grid-cols-[var(--cols-et)] gap-2 sm:items-center sm:w-max sm:min-w-full">
      {/* Nombre del packing list: FIJO, nunca cambia (referencia del grupo). */}
      <div className="min-h-[48px] flex items-center">
        <span className="block text-[11px] font-semibold uppercase text-blue-700 mb-1 sm:hidden mr-2">Nombre Packing</span>
        <p className="text-xs leading-snug text-slate-700 font-medium" title={a.nombrePacking || ''}>
          {a.nombrePacking}
        </p>
      </div>

      <Campo label="Nombre" value={a.nombre} onChange={(v) => onChange({ nombre: v })} placeholder="JD100M" />

      <Autocompletar
        label="Código de tela"
        value={a.codigo}
        onChange={(v) => onChange({ codigo: v })}
        placeholder="Buscar TTD-… o nombre"
        opciones={productos}
        onElegir={elegirProducto}
        render={(p) => (
          <>
            {p.codigo && <span className="font-semibold text-blue-900">{p.codigo}</span>}
            {/* Descripción COMPLETA (sin truncar): es lo que permite distinguir telas parecidas */}
            <span className="text-slate-600 block whitespace-normal break-words text-xs">{p.nombreCompleto || p.nombre}</span>
          </>
        )}
      />

      {/* Descripción completa del producto elegido (informativa, no se imprime
          en la etiqueta): ayuda a verificar que el código es el correcto. */}
      <div className="min-h-[48px] flex items-center">
        <span className="block text-[11px] font-semibold uppercase text-blue-700 mb-1 sm:hidden mr-2">Descripción</span>
        <p className="text-xs leading-snug text-slate-600 line-clamp-3" title={a.descripcion || ''}>
          {a.descripcion || <span className="text-slate-400">— elige un código —</span>}
        </p>
      </div>

      <Autocompletar
        label="Color"
        value={a.color}
        onChange={(v) => onChange({ color: v })}
        placeholder="Azul Obscuro"
        opciones={colores}
        onElegir={(c) => onChange({ color: c })}
        render={(c) => <span className="text-blue-900">{c}</span>}
      />

      <Campo
        label="Composición"
        value={a.composicion}
        onChange={(v) => onChange({ composicion: v })}
        placeholder="99% Algodón 1% Elastano"
      />

      <p className="text-sm text-slate-500 sm:text-right sm:text-xs">
        {a.rollos} rollo{a.rollos === 1 ? '' : 's'}
      </p>
    </div>
  );
}

// Input con desplegable de sugerencias propio (estilizado, no el <datalist>
// nativo). Se abre con foco + opciones; se elige con clic/tap o ↑↓ + Enter;
// Escape o blur lo cierran (mousedown en la opción gana al blur del input).
function Autocompletar({ label, value, onChange, placeholder, opciones, onElegir, render }) {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);

  const elegir = (op) => {
    onElegir(op);
    setAbierto(false);
    setActivo(-1);
  };

  const onKeyDown = (e) => {
    if (!abierto || !opciones.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo((v) => Math.min(v + 1, opciones.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((v) => Math.max(v - 1, 0));
    } else if (e.key === 'Enter' && activo >= 0) {
      e.preventDefault();
      elegir(opciones[activo]);
    } else if (e.key === 'Escape') {
      setAbierto(false);
    }
  };

  return (
    <label className="block relative">
      <span className="block text-[11px] font-semibold uppercase text-blue-700 mb-1 sm:hidden">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setAbierto(true);
          setActivo(-1);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full min-h-[48px] px-3 text-base sm:text-sm border border-slate-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
      />
      {abierto && opciones.length > 0 && (
        {/* Más ancho que el input para que la descripción completa quepa a lo largo */}
        <ul className="absolute left-0 top-full mt-1 z-30 min-w-full w-[460px] max-w-[80vw] max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1">
          {opciones.map((op, i) => (
            <li key={op.id ?? op}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // que el blur del input no cierre antes del clic
                  elegir(op);
                }}
                onMouseEnter={() => setActivo(i)}
                className={`w-full text-left px-3 py-2 text-sm leading-tight ${
                  i === activo ? 'bg-blue-50' : 'bg-white'
                }`}
              >
                {render(op)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}

function Campo({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase text-blue-700 mb-1 sm:hidden">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-h-[48px] px-3 text-base sm:text-sm border border-slate-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
      />
    </label>
  );
}
