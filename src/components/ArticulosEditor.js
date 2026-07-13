'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Tags } from 'lucide-react';
import { apiFetch } from '@/components/useApi';
import Spinner from '@/components/ui/Spinner';
import ErrorBanner from '@/components/ui/ErrorBanner';
import EmptyState from '@/components/ui/EmptyState';

const DEBOUNCE_MS = 300;
const MIN_CHARS_PRODUCTO = 1;

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
export default function ArticulosEditor({ open, importacionId, expedienteName, onClose, onSaved }) {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [articulos, setArticulos] = useState([]); // [{ nombreOrig, colorOrig, nombre, codigo, color, composicion, rollos }]

  useEffect(() => {
    if (!open || !importacionId) return;

    let cancelado = false;
    setCargando(true);
    setError('');
    setMsg('');

    (async () => {
      const res = await apiFetch(`/api/odoo/articulos?importacionId=${importacionId}`);
      if (cancelado) return;
      if (res.status === 'error') {
        setError(res.msg);
        setArticulos([]);
      } else {
        const lista = res.detalles?.articulos || [];
        setArticulos(
          lista.map((a) => ({
            nombreOrig: a.nombre || '',
            colorOrig: a.color || '',
            nombre: a.nombre || '',
            codigo: a.codigo || '',
            color: a.color || '',
            composicion: a.composicion || '',
            rollos: a.rollos || 0,
          })),
        );
      }
      setCargando(false);
    })();

    return () => {
      cancelado = true;
    };
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
        className="bg-white rounded-xl border border-slate-200 p-6 w-full max-w-3xl shadow-xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h3 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
            <Tags className="w-5 h-5 text-blue-700" aria-hidden="true" />
            Datos de etiqueta{expedienteName ? ` · ${expedienteName}` : ''}
          </h3>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="p-1.5 rounded text-blue-700 hover:bg-blue-50 transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm text-slate-500 mb-4 shrink-0">
          Estos datos van en la etiqueta y no vienen en el packing list. Código de tela y Color se sugieren
          desde Odoo — si no aparece el que buscas, escríbelo directamente.
        </p>

        {error && <ErrorBanner message={error} className="mb-3 shrink-0" />}
        {msg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3 shrink-0">{msg}</p>}

        <div className="flex-1 overflow-y-auto max-h-[80vh] -mx-1 px-1">
          {cargando ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : articulos.length === 0 ? (
            <EmptyState title="Sin artículos" description="Este expediente no tiene rollos cargados." />
          ) : (
            <div className="space-y-3">
              {/* Encabezado solo visible en sm+ (vista tipo tabla) */}
              <div className="hidden sm:grid sm:grid-cols-[1.1fr_1.3fr_1fr_1.4fr_0.7fr] gap-2 px-1 text-[11px] font-semibold uppercase text-blue-700">
                <span>Nombre</span>
                <span>Código de tela</span>
                <span>Color</span>
                <span>Composición</span>
                <span className="text-right">Rollos</span>
              </div>

              {articulos.map((a, idx) => (
                <ArticuloRow key={`${a.nombreOrig}|${a.colorOrig}`} articulo={a} onChange={(cambios) => actualizarArticulo(idx, cambios)} />
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
function ArticuloRow({ articulo: a, onChange }) {
  const [productos, setProductos] = useState([]);
  const [colores, setColores] = useState([]);
  const prodTimer = useRef(null);
  const colorTimer = useRef(null);

  useEffect(() => {
    clearTimeout(prodTimer.current);
    const q = a.codigo.trim();
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
  }, [a.codigo]);

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
    onChange({
      codigo: p.codigo || p.nombre,
      nombre: p.nombre || a.nombre,
      composicion: p.composicion || a.composicion,
      color: p.color || a.color,
    });
  };

  return (
    <div className="border border-slate-200 rounded-lg p-3 sm:p-2 grid grid-cols-1 sm:grid-cols-[1.1fr_1.3fr_1fr_1.4fr_0.7fr] gap-2 sm:items-center">
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
            <span className="text-slate-500 block truncate text-xs">{p.nombreCompleto || p.nombre}</span>
          </>
        )}
      />

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
        <ul className="absolute left-0 right-0 top-full mt-1 z-30 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1">
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
