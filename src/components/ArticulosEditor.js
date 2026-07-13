'use client';

import { useEffect, useState } from 'react';
import { X, Tags } from 'lucide-react';
import { apiFetch } from '@/components/useApi';
import Spinner from '@/components/ui/Spinner';
import ErrorBanner from '@/components/ui/ErrorBanner';
import EmptyState from '@/components/ui/EmptyState';

/**
 * Modal "Datos de etiqueta": completa por artículo (nombre+color) los 3 datos
 * que el packing list del proveedor NO trae y que el sticker necesita
 * (Código Distefano, Color legible, Composición). Se aplica UNA VEZ POR
 * ARTÍCULO a todos los rollos del grupo.
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

  const actualizarCampo = (idx, campo, valor) => {
    setArticulos((prev) => prev.map((a, i) => (i === idx ? { ...a, [campo]: valor } : a)));
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
          Estos datos van en la etiqueta y no vienen en el packing list.
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
              <div className="hidden sm:grid sm:grid-cols-[1.2fr_1fr_1fr_1.4fr_0.8fr] gap-2 px-1 text-[11px] font-semibold uppercase text-blue-700">
                <span>Nombre</span>
                <span>Código</span>
                <span>Color</span>
                <span>Composición</span>
                <span className="text-right">Rollos</span>
              </div>

              {articulos.map((a, idx) => (
                <div
                  key={`${a.nombreOrig}|${a.colorOrig}`}
                  className="border border-slate-200 rounded-lg p-3 sm:p-2 grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1fr_1.4fr_0.8fr] gap-2 sm:items-center"
                >
                  <Campo
                    label="Nombre"
                    value={a.nombre}
                    onChange={(v) => actualizarCampo(idx, 'nombre', v)}
                    placeholder="JD100M"
                  />
                  <Campo
                    label="Código"
                    value={a.codigo}
                    onChange={(v) => actualizarCampo(idx, 'codigo', v)}
                    placeholder="TTD-0150"
                  />
                  <Campo
                    label="Color"
                    value={a.color}
                    onChange={(v) => actualizarCampo(idx, 'color', v)}
                    placeholder="Azul Obscuro"
                  />
                  <Campo
                    label="Composición"
                    value={a.composicion}
                    onChange={(v) => actualizarCampo(idx, 'composicion', v)}
                    placeholder="99% Algodón 1% Elastan"
                  />
                  <p className="text-sm text-slate-500 sm:text-right sm:text-xs">
                    {a.rollos} rollo{a.rollos === 1 ? '' : 's'}
                  </p>
                </div>
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
