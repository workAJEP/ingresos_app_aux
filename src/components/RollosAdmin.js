'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Trash2, Search, PackageOpen, RefreshCw, RotateCcw } from 'lucide-react';
import { apiFetch } from '@/components/useApi';
import Spinner from '@/components/ui/Spinner';
import ErrorBanner from '@/components/ui/ErrorBanner';
import EmptyState from '@/components/ui/EmptyState';
import Badge from '@/components/ui/Badge';

/**
 * Modal "Administrar rollos": lista TODOS los rollos del expediente (incluye
 * pendientes) y permite eliminar los seleccionados o todos. Existe porque al
 * eliminar un bulto a mano el rollo NO se quita solo y queda huérfano
 * (desincronizado) — desde aquí se depura sin borrar el expediente completo.
 */
export default function RollosAdmin({ open, embedded = false, importacionId, expedienteName, onClose, onChanged }) {
  const [cargando, setCargando] = useState(true);
  const [eliminando, setEliminando] = useState(false);
  const [revirtiendo, setRevirtiendo] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [rollos, setRollos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [seleccion, setSeleccion] = useState(new Set());

  const cargar = async () => {
    setCargando(true);
    setError('');
    setMsg('');
    setSeleccion(new Set());
    const res = await apiFetch(`/api/odoo/rollos?importacionId=${importacionId}`);
    if (res.status === 'error') {
      setError(res.msg);
      setRollos([]);
    } else {
      setRollos(res.detalles?.rollos || []);
    }
    setCargando(false);
  };

  useEffect(() => {
    if ((!open && !embedded) || !importacionId) return;
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, embedded, importacionId]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return rollos;
    return rollos.filter(
      (r) =>
        String(r.barcode || '').toLowerCase().includes(q) ||
        String(r.pieza || '').toLowerCase().includes(q) ||
        String(r.nombre || '').toLowerCase().includes(q) ||
        String(r.color || '').toLowerCase().includes(q),
    );
  }, [rollos, busqueda]);

  if (!open && !embedded) return null;

  const toggle = (id) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisibles = () => {
    const idsVisibles = visibles.map((r) => r.id);
    const todosMarcados = idsVisibles.length > 0 && idsVisibles.every((id) => seleccion.has(id));
    setSeleccion((prev) => {
      const next = new Set(prev);
      for (const id of idsVisibles) {
        if (todosMarcados) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const eliminar = async (todos) => {
    const n = todos ? rollos.length : seleccion.size;
    if (!n) return;
    const ok = window.confirm(
      todos
        ? `¿Eliminar los ${n} rollo(s) del expediente ${expedienteName || ''}?\n\nEsta acción NO se puede deshacer.`
        : `¿Eliminar ${n} rollo(s) seleccionados?\n\nEsta acción NO se puede deshacer.`,
    );
    if (!ok) return;
    setEliminando(true);
    setError('');
    setMsg('');
    const qs = new URLSearchParams({ importacionId: String(importacionId) });
    if (!todos) qs.set('ids', [...seleccion].join(','));
    const res = await apiFetch(`/api/odoo/rollos?${qs.toString()}`, { method: 'DELETE' });
    setEliminando(false);
    if (res.status === 'error') {
      setError(res.msg);
      return;
    }
    setMsg(res.msg);
    onChanged?.();
    await cargar();
  };

  // Devuelve los rollos marcados a 'pendiente' (se escanearon por error). No
  // los borra: el rollo sigue en el expediente, listo para escanear de nuevo.
  const revertir = async () => {
    const ids = [...seleccion];
    if (!ids.length) return;
    const ok = window.confirm(
      `¿Revertir ${ids.length} rollo(s) a Pendiente?

Se borra el ingreso registrado (fechas y operador) y podrán escanearse de nuevo.`,
    );
    if (!ok) return;
    setRevirtiendo(true);
    setError('');
    setMsg('');
    const res = await apiFetch('/api/odoo/rollos', {
      method: 'PATCH',
      body: { importacionId, ids },
    });
    setRevirtiendo(false);
    if (res.status === 'error') {
      setError(res.msg);
      return;
    }
    setMsg(res.msg);
    onChanged?.();
    await cargar();
  };

  const cerrar = () => {
    setError('');
    setMsg('');
    setBusqueda('');
    onClose?.();
  };

  const cuerpo = (
    <>
      <div className="flex items-center justify-between mb-2 shrink-0">
        <h3 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
          <PackageOpen className="w-5 h-5 text-blue-700" aria-hidden="true" />
          {embedded ? 'Rollos del expediente' : `Administrar rollos${expedienteName ? ` · ${expedienteName}` : ''}`}
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cargar}
            disabled={cargando || eliminando || revirtiendo}
            aria-label="Actualizar"
            className="p-1.5 rounded text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>
          {!embedded && (
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar"
              className="p-1.5 rounded text-blue-700 hover:bg-blue-50 transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-slate-500 mb-3 shrink-0">
        Marca los rollos huérfanos o equivocados y elimínalos para que el expediente quede sincronizado.
      </p>

      {error && <ErrorBanner message={error} className="mb-3 shrink-0" />}
      {msg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3 shrink-0">{msg}</p>}

      <div className="relative mb-3 shrink-0">
        <Search className="w-3.5 h-3.5 text-blue-700 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar código, pieza, artículo, color…"
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg">
        {cargando ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : visibles.length === 0 ? (
          <EmptyState title="Sin rollos" description={busqueda ? 'Nada coincide con la búsqueda.' : 'Este expediente no tiene rollos cargados.'} />
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-white text-blue-700 border-b border-slate-200 sticky top-0">
              <tr className="divide-x divide-slate-200">
                <th className="px-3 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={visibles.length > 0 && visibles.every((r) => seleccion.has(r.id))}
                    onChange={toggleVisibles}
                    title="Marcar/desmarcar los visibles"
                    className="w-4 h-4 accent-blue-800 cursor-pointer"
                  />
                </th>
                <th className="px-3 py-2.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Código</th>
                <th className="px-3 py-2.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Pieza</th>
                <th className="px-3 py-2.5 text-xs font-bold uppercase tracking-wider">Artículo</th>
                <th className="px-3 py-2.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Color</th>
                <th className="px-3 py-2.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => toggle(r.id)}
                  className={`border-b border-slate-100 divide-x divide-slate-100 cursor-pointer transition-colors ${
                    seleccion.has(r.id) ? 'bg-blue-50/60' : 'hover:bg-blue-50/30'
                  }`}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={seleccion.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="w-4 h-4 accent-blue-800 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums text-blue-900 whitespace-nowrap">{r.barcode}</td>
                  <td className="px-3 py-2 text-blue-900 whitespace-nowrap">{r.pieza}</td>
                  <td className="px-3 py-2 text-blue-900">{r.nombre}</td>
                  <td className="px-3 py-2 text-blue-900 whitespace-nowrap">{r.color}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Badge estado={r.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-200 shrink-0">
        <p className="text-sm text-slate-500">
          {rollos.length} rollo(s) · <span className="font-semibold text-blue-900">{seleccion.size}</span> seleccionado(s)
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={revertir}
            disabled={revirtiendo || eliminando || cargando || seleccion.size === 0}
            title="Devuelve los rollos marcados al estado Pendiente (se podrán escanear de nuevo)"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-blue-800 border border-slate-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            {revirtiendo ? <Spinner size="sm" /> : <RotateCcw className="w-4 h-4" aria-hidden="true" />}
            Revertir a pendiente ({seleccion.size})
          </button>
          <button
            type="button"
            onClick={() => eliminar(true)}
            disabled={eliminando || revirtiendo || cargando || rollos.length === 0}
            className="px-4 py-2 text-sm font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            Eliminar todos
          </button>
          <button
            type="button"
            onClick={() => eliminar(false)}
            disabled={eliminando || revirtiendo || cargando || seleccion.size === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors disabled:opacity-50"
          >
            {eliminando ? <Spinner size="sm" className="text-white" /> : <Trash2 className="w-4 h-4" aria-hidden="true" />}
            Eliminar seleccionados ({seleccion.size})
          </button>
        </div>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 flex flex-col max-h-[75vh]">{cuerpo}</div>
    );
  }

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
        className="bg-white rounded-xl border border-slate-200 p-6 w-[96vw] max-w-[900px] shadow-xl max-h-[92vh] flex flex-col"
      >
        {cuerpo}
      </div>
    </div>
  );
}
