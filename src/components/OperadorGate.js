'use client';

import { useCallback, useEffect, useState } from 'react';
import { User, Pencil } from 'lucide-react';

const STORAGE_KEY = 'ic_operador';

/** Hook de estado del operador (localStorage ic_operador). Fuente única de verdad. */
export function useOperador() {
  const [operador, setOperadorState] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let guardado = '';
    try {
      guardado = window.localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      // localStorage no disponible; se continúa sin persistencia
    }
    if (guardado) {
      setOperadorState(guardado);
      setReady(true);
      return;
    }
    // Sin operador guardado: precargar con el nombre del usuario logueado (Odoo).
    // Sigue siendo editable (equipo compartido: alguien puede escanear con otro
    // nombre) y solo se persiste cuando el usuario confirma en el modal.
    let activo = true;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (activo && data && data.name) setOperadorState(String(data.name));
      })
      .catch(() => {})
      .finally(() => {
        if (activo) setReady(true);
      });
    return () => {
      activo = false;
    };
  }, []);

  const setOperador = useCallback((nombre) => {
    const limpio = String(nombre || '').trim();
    setOperadorState(limpio);
    try {
      if (limpio) window.localStorage.setItem(STORAGE_KEY, limpio);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage no disponible
    }
  }, []);

  return { operador, setOperador, ready };
}

/**
 * Gate de operador: bloquea con modal de captura si no hay operador guardado,
 * muestra chip con nombre + botón cambiar, y renderiza children solo si hay operador.
 * Recibe operador/setOperador/ready desde useOperador() del padre (fuente única de estado).
 */
export default function OperadorGate({ operador, setOperador, ready = true, showChip = true, children }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!ready) return null;

  const abrirEdicion = () => {
    setDraft(operador);
    setEditing(true);
  };

  const guardar = (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setOperador(draft);
    setEditing(false);
  };

  const mostrarModal = editing || !operador;

  return (
    <>
      {showChip && operador && !editing && (
        <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1.5 text-sm">
          <User className="w-4 h-4 text-blue-700" aria-hidden="true" />
          <span className="font-semibold text-blue-900">{operador}</span>
          <button
            type="button"
            onClick={abrirEdicion}
            className="p-0.5 rounded text-blue-700 hover:bg-blue-50 transition-colors"
            aria-label="Cambiar operador"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {mostrarModal && (
        <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" className="bg-white rounded-xl border border-slate-200 p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">Identificación de operador</h3>
            <form onSubmit={guardar} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-blue-700 mb-1" htmlFor="operador-input">
                  Nombre del operador
                </label>
                <input
                  id="operador-input"
                  type="text"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  placeholder="Nombre y apellido"
                />
              </div>
              <div className="flex justify-end gap-3">
                {operador && (
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="px-4 py-2 text-sm text-blue-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="px-4 py-2 text-sm text-white bg-blue-800 hover:bg-blue-900 rounded-xl transition-colors disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {operador && children}
    </>
  );
}
