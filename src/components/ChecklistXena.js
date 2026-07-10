'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, PackageCheck } from 'lucide-react';
import { apiFetch } from './useApi';
import Spinner from './ui/Spinner';
import EmptyState from './ui/EmptyState';
import { beep } from '@/lib/beep';

const CONFIRM_TIMEOUT_MS = 3000;

/**
 * Checklist en vivo de recepción Xena (modal full-screen). Port de la UX
 * original (test2.md): doble clic de confirmación por rollo (⚠️ Confirmar,
 * amarillo, 3s de espera) y "Recibir todos" (doble clic, rojo) -> POST
 * /api/odoo/receive-bulk.
 */
export default function ChecklistXena({ open, onClose, operador, importacionId, onReceived }) {
  const [loading, setLoading] = useState(true);
  const [rollos, setRollos] = useState([]);
  const [recibidos, setRecibidos] = useState(new Set());
  const [procesando, setProcesando] = useState(new Set());
  const [confirmando, setConfirmando] = useState(null);
  const [confirmandoTodos, setConfirmandoTodos] = useState(false);
  const [error, setError] = useState('');
  const timersRef = useRef({});

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    const qs = importacionId ? `?importacionId=${importacionId}` : '';
    const res = await apiFetch(`/api/odoo/transit${qs}`);
    if (res.status === 'error') {
      setError(res.msg);
      setRollos([]);
    } else {
      setRollos(res.detalles?.rollos || []);
    }
    setRecibidos(new Set());
    setLoading(false);
  }, [importacionId]);

  useEffect(() => {
    if (open) cargar();
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
      timersRef.current = {};
    };
  }, [open, cargar]);

  const cancelarConfirmacion = (codigo) => {
    if (timersRef.current[codigo]) {
      clearTimeout(timersRef.current[codigo]);
      delete timersRef.current[codigo];
    }
    setConfirmando((actual) => (actual === codigo ? null : actual));
  };

  const clickRollo = (codigo) => {
    if (procesando.has(codigo) || recibidos.has(codigo)) return;
    if (confirmando !== codigo) {
      setConfirmando(codigo);
      timersRef.current[codigo] = setTimeout(() => cancelarConfirmacion(codigo), CONFIRM_TIMEOUT_MS);
      return;
    }
    cancelarConfirmacion(codigo);
    recibirRollos([codigo]);
  };

  const clickTodos = () => {
    const pendientes = rollos.filter((r) => !recibidos.has(r.codigo)).map((r) => r.codigo);
    if (pendientes.length === 0) return;
    if (!confirmandoTodos) {
      setConfirmandoTodos(true);
      timersRef.current.__todos = setTimeout(() => setConfirmandoTodos(false), CONFIRM_TIMEOUT_MS);
      return;
    }
    clearTimeout(timersRef.current.__todos);
    setConfirmandoTodos(false);
    recibirRollos(pendientes);
  };

  const recibirRollos = async (codigos) => {
    setProcesando((prev) => new Set([...prev, ...codigos]));
    const res = await apiFetch('/api/odoo/receive-bulk', {
      method: 'POST',
      body: { barcodes: codigos, operador },
    });
    setProcesando((prev) => {
      const next = new Set(prev);
      codigos.forEach((c) => next.delete(c));
      return next;
    });
    if (res.status === 'error') {
      beep('error');
      setError(res.msg);
      return;
    }
    const omitidos = new Set(res.detalles?.omitidos || []);
    const exitosos = codigos.filter((c) => !omitidos.has(c));
    beep(exitosos.length > 0 ? 'success' : 'error');
    setRecibidos((prev) => new Set([...prev, ...exitosos]));
    onReceived?.(res.detalles);
  };

  if (!open) return null;

  const total = rollos.length;
  const completados = recibidos.size;

  return (
    <div className="fixed inset-0 z-[250] bg-white flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-200 bg-white">
        <h2 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
          <PackageCheck className="w-5 h-5 text-blue-700" aria-hidden="true" />
          Recepción de rollos
        </h2>
        <div className="flex items-center gap-4">
          <div className="text-right leading-tight">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Progreso</p>
            <p className="text-lg font-bold text-blue-900 tabular-nums">
              {completados} de {total}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 rounded-lg text-blue-700 hover:bg-blue-50 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-3 border-b border-slate-200 bg-slate-50">
        <button
          type="button"
          onClick={clickTodos}
          disabled={total === 0 || completados === total}
          className={`w-full min-h-[48px] rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
            confirmandoTodos ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-800 hover:bg-blue-900'
          }`}
        >
          {confirmandoTodos ? `⚠️ ¿Confirmar recepción de ${total - completados} rollos?` : 'Recibir todos'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3">
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>
        )}
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : total === 0 ? (
          <EmptyState title="Sin rollos en tránsito" description="No hay ningún rollo en ruta esperando recepción." />
        ) : (
          <ul className="space-y-2">
            {rollos.map((r) => {
              const recibido = recibidos.has(r.codigo);
              const enProceso = procesando.has(r.codigo);
              const confirmandoEste = confirmando === r.codigo;
              return (
                <li
                  key={r.codigo}
                  className={`flex items-center justify-between gap-3 border rounded-lg px-3 py-2.5 transition-colors ${
                    recibido ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-blue-900 font-mono tabular-nums truncate">{r.codigo}</p>
                    <p className="text-xs text-slate-500 truncate">
                      Pieza <span className="font-semibold text-slate-700">{r.pieza}</span> · Cód.{' '}
                      <span className="font-semibold text-slate-700">{r.codigoDist}</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      {r.metros} Mts / {r.yardas} Yds
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => clickRollo(r.codigo)}
                    disabled={recibido || enProceso}
                    className={`shrink-0 min-h-[48px] min-w-[120px] px-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-70 ${
                      recibido
                        ? 'bg-slate-400 text-white'
                        : confirmandoEste
                        ? 'bg-amber-400 text-black'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {recibido ? '✅ Recibido' : enProceso ? '…' : confirmandoEste ? '⚠️ Confirmar' : 'Recibir'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
