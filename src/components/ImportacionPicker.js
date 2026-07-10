'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, Loader2 } from 'lucide-react';
import { apiFetch } from './useApi';

/**
 * Selector de expediente (distefano.importacion) con búsqueda en vivo contra
 * GET /api/odoo/importaciones?q=. allowAll agrega la opción "Todos" (usada en
 * el dashboard); en UploadContenedor se desactiva para forzar selección.
 */
export default function ImportacionPicker({ value, onChange, allowAll = true, className = '' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [opciones, setOpciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [seleccionLabel, setSeleccionLabel] = useState(allowAll ? 'Todos los expedientes' : 'Selecciona un expediente');
  const rootRef = useRef(null);
  const debounceRef = useRef(null);

  const buscar = useCallback(async (q) => {
    setLoading(true);
    const res = await apiFetch(`/api/odoo/importaciones?q=${encodeURIComponent(q || '')}`);
    setLoading(false);
    if (res.status !== 'error') {
      setOpciones(res.detalles?.importaciones || []);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => buscar(query), 250);
    return () => clearTimeout(debounceRef.current);
  }, [open, query, buscar]);

  useEffect(() => {
    if (!value) {
      setSeleccionLabel(allowAll ? 'Todos los expedientes' : 'Selecciona un expediente');
    }
  }, [value, allowAll]);

  useEffect(() => {
    const onClickFuera = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  const seleccionar = (item) => {
    setSeleccionLabel(item ? item.name : 'Todos los expedientes');
    onChange?.(item ? item.id : null);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={rootRef} className={`relative w-full sm:w-72 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 bg-gray-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-blue-900"
      >
        <span className="truncate">{seleccionLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 text-blue-700 shrink-0" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
            <Search className="w-3.5 h-3.5 text-blue-700 shrink-0" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar expediente…"
              className="flex-1 text-sm outline-none"
            />
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-700" aria-hidden="true" />}
          </div>
          <ul className="max-h-64 overflow-y-auto text-sm">
            {allowAll && (
              <li>
                <button
                  type="button"
                  onClick={() => seleccionar(null)}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50/40 text-blue-900 font-semibold"
                >
                  Todos los expedientes
                </button>
              </li>
            )}
            {opciones.map((imp) => (
              <li key={imp.id}>
                <button
                  type="button"
                  onClick={() => seleccionar(imp)}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50/40"
                >
                  <p className="font-semibold text-blue-900 truncate">{imp.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {imp.descripcion}
                    {imp.contenedor ? ` · ${imp.contenedor}` : ''}
                  </p>
                </button>
              </li>
            ))}
            {!loading && opciones.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-400">Sin resultados.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
