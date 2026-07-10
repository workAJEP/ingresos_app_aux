'use client';

import { useEffect, useState } from 'react';
import { Printer, Loader2, Check, X, Pencil, Layers, Barcode } from 'lucide-react';
import { apiFetch } from './useApi';
import { beep } from '@/lib/beep';
import { normalizarBarcode } from '@/lib/barcode';

const LS_KEY = 'ic_departamento';
const SUGERIDOS = ['PRODUCCION', 'BODEGA', 'CORTE', 'DHARMA'];

/**
 * Impresión de stickers de rollos VERIFICADOS (ya escaneados en el ingreso;
 * el filtro lo aplica la API). Dos usos:
 *  - `barcodes`: botón directo (p.ej. tras un escaneo exitoso).
 *  - `chooser` + `importacionId`: botón "Imprimir" que abre el selector
 *    Individual (por código) / Masivo (todos los verificados del expediente,
 *    con confirmación por doble-clic).
 * El departamento lo elige el usuario (columna del sticker) y se recuerda.
 */
export default function PrintStickerButton({
  barcodes,
  importacionId,
  count,
  chooser = false,
  label = 'Imprimir sticker',
  className = '',
}) {
  const [departamento, setDepartamento] = useState('');
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');
  const [abierto, setAbierto] = useState(false); // panel individual/masivo
  const [codigoInd, setCodigoInd] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false); // doble-clic masiva
  const [msg, setMsg] = useState(null); // {ok, texto}

  useEffect(() => {
    const guardado = localStorage.getItem(LS_KEY) || '';
    setDepartamento(guardado);
    if (!guardado) setBorrador(SUGERIDOS[0]);
  }, []);

  const codes = (barcodes || []).filter(Boolean);
  if (!codes.length && !importacionId) return null;

  const guardarDepartamento = () => {
    const d = borrador.trim().toUpperCase();
    if (!d) return;
    localStorage.setItem(LS_KEY, d);
    setDepartamento(d);
    setEditando(false);
  };

  const enviar = async (body) => {
    if (!departamento) {
      setEditando(true);
      return;
    }
    setEnviando(true);
    setMsg(null);
    const res = await apiFetch('/api/print/stickers', { method: 'POST', body: { ...body, departamento } });
    setEnviando(false);
    const ok = res.status === 'success';
    beep(ok ? 'success' : 'error');
    setMsg({ ok, texto: res.msg || (ok ? 'Enviado a imprimir.' : 'No se pudo imprimir.') });
  };

  const imprimirMasivo = () => {
    if (!departamento) {
      setEditando(true);
      return;
    }
    if (!confirmando) {
      setConfirmando(true);
      setTimeout(() => setConfirmando(false), 3000);
      return;
    }
    setConfirmando(false);
    enviar({ importacionId });
  };

  const imprimirIndividual = () => {
    const norm = normalizarBarcode(codigoInd);
    if (!norm.ok) {
      setMsg({ ok: false, texto: norm.error || 'Código inválido.' });
      return;
    }
    setCodigoInd('');
    enviar({ barcodes: [norm.codigo] });
  };

  const chipDepartamento = departamento && !editando && (
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
  );

  const editorDepartamento = editando && (
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
  );

  // --- Modo directo (barcodes): botón único ---
  if (!chooser) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => enviar(importacionId ? { importacionId } : { barcodes: codes })}
            disabled={enviando}
            className="flex items-center justify-center gap-1.5 min-h-[52px] w-full sm:w-auto px-4 bg-white border border-slate-200 text-blue-800 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Printer className="w-4 h-4" aria-hidden="true" />}
            {label}
            {codes.length > 1 ? ` (${codes.length})` : ''}
          </button>
          {chipDepartamento}
        </div>
        {editorDepartamento}
        {msg && <p className={`text-sm font-semibold ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.texto}</p>}
      </div>
    );
  }

  // --- Modo chooser (card de expediente): Imprimir → individual / masivo ---
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="flex items-center justify-center gap-1.5 min-h-[52px] w-full sm:w-auto px-4 bg-white border border-slate-200 text-blue-800 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-colors"
        >
          <Printer className="w-4 h-4" aria-hidden="true" />
          Imprimir
        </button>
        {abierto && chipDepartamento}
      </div>

      {abierto && (
        <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50">
          {editorDepartamento}

          <div className="flex gap-2">
            <input
              type="text"
              value={codigoInd}
              onChange={(e) => setCodigoInd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  imprimirIndividual();
                }
              }}
              placeholder="Código del rollo (individual)…"
              className="flex-1 min-h-[48px] px-3 text-base border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
            <button
              type="button"
              onClick={imprimirIndividual}
              disabled={enviando || !codigoInd.trim()}
              className="flex items-center justify-center gap-1.5 min-h-[48px] px-4 bg-blue-800 hover:bg-blue-900 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <Barcode className="w-4 h-4" aria-hidden="true" />
              Individual
            </button>
          </div>

          <button
            type="button"
            onClick={imprimirMasivo}
            disabled={enviando || !count}
            className={`w-full flex items-center justify-center gap-1.5 min-h-[48px] px-4 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 ${
              confirmando
                ? 'bg-amber-50 border border-amber-200 text-amber-700'
                : 'bg-white border border-slate-200 text-blue-800 hover:bg-blue-50'
            }`}
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Layers className="w-4 h-4" aria-hidden="true" />}
            {confirmando
              ? `⚠️ Confirmar impresión masiva (${count} etiquetas)`
              : `Masivo: ${count} rollo(s) verificados`}
          </button>

          {msg && <p className={`text-sm font-semibold ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.texto}</p>}
        </div>
      )}
    </div>
  );
}
