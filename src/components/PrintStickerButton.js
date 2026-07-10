'use client';

import { useEffect, useState } from 'react';
import { Printer, Loader2, Check, X, Pencil } from 'lucide-react';
import { apiFetch } from './useApi';
import { beep } from '@/lib/beep';

const LS_KEY = 'ic_departamento';
const SUGERIDOS = ['PRODUCCION', 'BODEGA', 'CORTE', 'DHARMA'];

/**
 * Botón "Imprimir sticker" para uno o varios rollos (por barcode) o para un
 * expediente COMPLETO (importacionId → impresión masiva). El departamento lo
 * elige el usuario (columna del sticker); se recuerda en localStorage.
 * POST /api/print/stickers → cola → poller BarTender.
 */
export default function PrintStickerButton({ barcodes, importacionId, count, label = 'Imprimir sticker', className = '' }) {
  const [departamento, setDepartamento] = useState('');
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false); // doble-clic en masiva
  const [msg, setMsg] = useState(null); // {ok, texto}

  useEffect(() => {
    const guardado = localStorage.getItem(LS_KEY) || '';
    setDepartamento(guardado);
    if (!guardado) setBorrador(SUGERIDOS[0]);
  }, []);

  const codes = (barcodes || []).filter(Boolean);
  if (!codes.length && !importacionId) return null;
  const n = importacionId ? count || 0 : codes.length;

  const guardarDepartamento = () => {
    const d = borrador.trim().toUpperCase();
    if (!d) return;
    localStorage.setItem(LS_KEY, d);
    setDepartamento(d);
    setEditando(false);
  };

  const imprimir = async () => {
    if (!departamento) {
      setEditando(true);
      return;
    }
    // Masiva: confirmación por doble-clic (evita imprimir cientos por error).
    if (importacionId && !confirmando) {
      setConfirmando(true);
      setTimeout(() => setConfirmando(false), 3000);
      return;
    }
    setConfirmando(false);
    setEnviando(true);
    setMsg(null);
    const body = importacionId ? { importacionId, departamento } : { barcodes: codes, departamento };
    const res = await apiFetch('/api/print/stickers', {
      method: 'POST',
      body,
    });
    setEnviando(false);
    const ok = res.status === 'success';
    beep(ok ? 'success' : 'error');
    setMsg({ ok, texto: res.msg || (ok ? 'Enviado a imprimir.' : 'No se pudo imprimir.') });
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={imprimir}
          disabled={enviando}
          className={`flex items-center justify-center gap-1.5 min-h-[52px] w-full sm:w-auto px-4 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 ${
            confirmando
              ? 'bg-amber-50 border border-amber-200 text-amber-700'
              : 'bg-white border border-slate-200 text-blue-800 hover:bg-slate-50'
          }`}
        >
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Printer className="w-4 h-4" aria-hidden="true" />}
          {confirmando ? `⚠️ Confirmar impresión${n ? ` (${n} etiquetas)` : ''}` : `${label}${n > 1 ? ` (${n})` : ''}`}
        </button>

        {departamento && !editando && (
          <button
            type="button"
            onClick={() => {
              setBorrador(departamento);
              setEditando(true);
            }}
            className="flex items-center justify-center gap-1.5 min-h-[52px] px-3 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg"
            title="Cambiar departamento"
          >
            {departamento}
            <Pencil className="w-3 h-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {editando && (
        <div className="flex gap-2 items-center">
          <input
            list="ic-departamentos"
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                guardarDepartamento();
              }
            }}
            placeholder="Departamento del sticker…"
            autoFocus
            className="flex-1 min-h-[48px] px-3 text-base border border-slate-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
          <datalist id="ic-departamentos">
            {SUGERIDOS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={guardarDepartamento}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center bg-blue-800 hover:bg-blue-900 text-white rounded-lg"
            aria-label="Guardar departamento"
          >
            <Check className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center bg-white border border-slate-200 text-blue-800 rounded-lg"
            aria-label="Cancelar"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      )}

      {msg && (
        <p className={`text-sm font-semibold ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.texto}</p>
      )}
    </div>
  );
}
