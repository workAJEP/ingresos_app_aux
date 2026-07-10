'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  PackagePlus,
  Truck,
  Warehouse,
  Undo2,
  ChevronDown,
  ChevronUp,
  FileText,
  ClipboardList,
  ArrowLeft,
} from 'lucide-react';
import OperadorGate, { useOperador } from '@/components/OperadorGate';
import BarcodeScanner from '@/components/BarcodeScanner';
import ScanResultCard from '@/components/ScanResultCard';
import ChecklistXena from '@/components/ChecklistXena';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { apiFetch } from '@/components/useApi';
import { normalizarBarcode } from '@/lib/barcode';
import { beep } from '@/lib/beep';

const FASES = {
  ingreso: {
    titulo: 'Ingreso Bodega Z14',
    icon: PackagePlus,
    hero: 'from-blue-800 to-blue-600',
    estadoDestino: 'bodega',
    placeholder: 'Código para ingreso Z14…',
  },
  piloto: {
    titulo: 'Carga Piloto',
    icon: Truck,
    hero: 'from-amber-600 to-amber-400',
    estadoDestino: 'transito',
    placeholder: 'Código a despachar…',
  },
  xena: {
    titulo: 'Recepción Xena Coj',
    icon: Warehouse,
    hero: 'from-green-700 to-green-500',
    estadoDestino: 'recibido',
    placeholder: 'Código descargado…',
  },
};

const MAX_UNDO = 10;
const MAX_HISTORIAL = 15;

function ScanContent() {
  const searchParams = useSearchParams();
  const faseParam = searchParams.get('fase');
  const fase = FASES[faseParam] ? faseParam : 'ingreso';
  const cfg = FASES[fase];

  const { operador, setOperador, ready } = useOperador();
  const [codigo, setCodigo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [errorLocal, setErrorLocal] = useState('');
  const [contador, setContador] = useState(0);
  const [pila, setPila] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [checklistAbierto, setChecklistAbierto] = useState(false);
  const inputRef = useRef(null);
  const resultRef = useRef(null);

  useEffect(() => {
    setContador(0);
    setResultado(null);
    setPila([]);
    setHistorial([]);
  }, [fase]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [fase]);

  const procesar = useCallback(
    async (crudo, source) => {
      if (procesando) return;
      const norm = normalizarBarcode(crudo);
      if (!norm.ok) {
        setErrorLocal(norm.error || 'Código inválido.');
        beep('error');
        return;
      }
      setErrorLocal('');
      setProcesando(true);
      // Código YA FILTRADO por la app (Santista: sin los 2 dígitos de control
      // finales; demás proveedores: completo) — ver lib/barcode.js.
      const codigoNormalizado = norm.codigo;
      const res = await apiFetch('/api/odoo/scan', {
        method: 'POST',
        body: { barcode: codigoNormalizado, fase, operador, source },
      });
      setProcesando(false);
      setCodigo('');
      inputRef.current?.focus();

      beep(res.status === 'success' ? 'success' : 'error');
      setResultado(res);
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });

      const entrada = {
        codigo: res.detalles?.codigo || codigoNormalizado,
        status: res.status,
        msg: res.msg,
        hora: new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };
      setHistorial((prev) => [entrada, ...prev].slice(0, MAX_HISTORIAL));

      if (res.status === 'success') {
        setContador((c) => c + 1);
        setPila((prev) => [{ codigo: entrada.codigo, estadoEsperado: cfg.estadoDestino }, ...prev].slice(0, MAX_UNDO));
      }
    },
    [procesando, fase, operador, cfg.estadoDestino]
  );

  const deshacer = useCallback(async () => {
    const [tope, ...resto] = pila;
    if (!tope) return;
    setProcesando(true);
    const res = await apiFetch('/api/odoo/scan/undo', {
      method: 'POST',
      body: { barcode: tope.codigo, estadoEsperado: tope.estadoEsperado, operador },
    });
    setProcesando(false);
    beep(res.status === 'success' ? 'success' : 'error');
    setResultado(res);
    requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    if (res.status === 'success') {
      setPila(resto);
      setContador((c) => Math.max(0, c - 1));
    }
  }, [pila, operador]);

  const onManualSubmit = (e) => {
    e.preventDefault();
    if (!codigo.trim()) return;
    procesar(codigo, 'manual');
  };

  const onDetected = useCallback(
    (valor) => {
      procesar(valor, 'camera');
    },
    [procesar]
  );

  const Icon = cfg.icon;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 pb-24 md:pb-16 space-y-4">
      <div className={`sticky top-0 z-20 -mx-4 sm:mx-0 rounded-none sm:rounded-xl p-4 sm:p-6 text-white bg-gradient-to-br ${cfg.hero} space-y-2 shadow-sm`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              aria-label="Volver a inicio"
              className="shrink-0 p-1.5 -ml-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </Link>
            <h1
              className="flex items-center gap-2 font-semibold min-w-0 truncate"
              style={{ fontSize: 'clamp(1.05rem, 2.5vw, 1.5rem)' }}
            >
              <Icon className="w-6 h-6 shrink-0" aria-hidden="true" />
              <span className="truncate">{cfg.titulo}</span>
            </h1>
          </div>
          <div className="text-right leading-tight shrink-0">
            <p className="text-[11px] uppercase tracking-wide opacity-80">Escaneados</p>
            <p className="text-2xl font-bold tabular-nums">{contador}</p>
          </div>
        </div>
      </div>

      <OperadorGate operador={operador} setOperador={setOperador} ready={ready}>
        {errorLocal && <ErrorBanner message={errorLocal} onDismiss={() => setErrorLocal('')} />}

        <BarcodeScanner onDetected={onDetected} disabled={procesando} />

        <form onSubmit={onManualSubmit} className="flex flex-col sm:flex-row gap-2">
          <input
            ref={inputRef}
            type="text"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder={cfg.placeholder}
            disabled={procesando}
            autoFocus
            className="flex-1 w-full min-h-[52px] px-3 py-2 text-base border border-slate-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={procesando || !codigo.trim()}
            className="min-h-[52px] w-full sm:w-auto px-5 bg-blue-800 hover:bg-blue-900 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            Ingresar
          </button>
        </form>

        <div ref={resultRef}>
          <ScanResultCard resultado={resultado} fase={fase} />
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
          {pila.length > 0 && (
            <button
              type="button"
              onClick={deshacer}
              disabled={procesando}
              className="flex items-center justify-center gap-1.5 min-h-[52px] w-full sm:w-auto px-4 bg-white border border-slate-200 text-blue-800 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <Undo2 className="w-4 h-4" aria-hidden="true" />
              Deshacer último ({pila.length})
            </button>
          )}
          {fase === 'piloto' && (
            <Link
              href="/manifiesto"
              className="flex items-center justify-center gap-1.5 min-h-[52px] w-full sm:w-auto px-4 bg-white border border-slate-200 text-blue-800 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-colors"
            >
              <FileText className="w-4 h-4" aria-hidden="true" />
              Manifiesto
            </Link>
          )}
          {fase === 'xena' && (
            <button
              type="button"
              onClick={() => setChecklistAbierto(true)}
              className="flex items-center justify-center gap-1.5 min-h-[52px] w-full sm:w-auto px-4 bg-white border border-slate-200 text-blue-800 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-colors"
            >
              <ClipboardList className="w-4 h-4" aria-hidden="true" />
              Recepciones pendientes
            </button>
          )}
        </div>

        {historial.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setHistorialAbierto((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-blue-900"
            >
              Historial de sesión ({historial.length})
              {historialAbierto ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
            </button>
            {historialAbierto && (
              <ul className="border-t border-slate-100 divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {historial.map((h, i) => (
                  <li key={`${h.codigo}-${i}`} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                    <span className="font-mono tabular-nums text-blue-900">{h.codigo}</span>
                    <span
                      className={`text-xs font-semibold truncate ${
                        h.status === 'success'
                          ? 'text-green-700'
                          : h.status === 'warning'
                          ? 'text-amber-700'
                          : h.status === 'info'
                          ? 'text-blue-700'
                          : 'text-red-700'
                      }`}
                    >
                      {h.msg}
                    </span>
                    <span className="text-xs text-slate-400 tabular-nums shrink-0">{h.hora}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </OperadorGate>

      {fase === 'xena' && (
        <ChecklistXena open={checklistAbierto} onClose={() => setChecklistAbierto(false)} operador={operador} onReceived={() => {}} />
      )}
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-10 text-center text-sm text-slate-400">Cargando…</div>}>
      <ScanContent />
    </Suspense>
  );
}
