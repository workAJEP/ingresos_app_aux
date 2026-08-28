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
  ScanLine,
} from 'lucide-react';
import OperadorGate, { useOperador } from '@/components/OperadorGate';
import BarcodeScanner from '@/components/BarcodeScanner';
import ScanResultCard from '@/components/ScanResultCard';
import PrintStickerButton from '@/components/PrintStickerButton';
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
  // Ultimo codigo escaneado (ya normalizado). Sirve para reimprimir el sticker
  // aunque el ingreso haya sido RECHAZADO por "ya fue registrado": el rollo
  // existe y esta verificado, solo se volvio a pasar por el lector.
  const [ultimoCodigo, setUltimoCodigo] = useState('');
  const [errorLocal, setErrorLocal] = useState('');
  const [contador, setContador] = useState(0);
  const [pila, setPila] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [historialAbierto, setHistorialAbierto] = useState(true);
  // Modo del ingreso: 'bodega' = solo ingresar a Z14; 'trasladar' = ingresar y
  // en el MISMO escaneo cargarlo al piloto (bodega -> tránsito) + carga en Despachos.
  const [modo, setModo] = useState('bodega');
  // Reparto en cargas de Despachos: tope de rollos por carga (vacío = sin tope)
  // y bandera "el próximo escaneo abre una carga nueva".
  const [maxRollos, setMaxRollos] = useState('');
  const [nuevaCarga, setNuevaCarga] = useState(false);
  const [checklistAbierto, setChecklistAbierto] = useState(false);
  const inputRef = useRef(null);
  const resultRef = useRef(null);

  useEffect(() => {
    setContador(0);
    setResultado(null);
    setUltimoCodigo('');
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
      setUltimoCodigo(codigoNormalizado);
      let res = await apiFetch('/api/odoo/scan', {
        method: 'POST',
        body: { barcode: codigoNormalizado, fase, operador, source },
      });

      // Modo "Ingresar y trasladar": tras el ingreso exitoso, el MISMO escaneo
      // lo carga al piloto (bodega -> tránsito). Si el traslado falla, el
      // ingreso ya quedó hecho y se avisa como warning.
      let estadoUndo = cfg.estadoDestino;
      if (fase === 'ingreso' && modo === 'trasladar' && res.status === 'success') {
        const res2 = await apiFetch('/api/odoo/scan', {
          method: 'POST',
          body: { barcode: codigoNormalizado, fase: 'piloto', operador, source },
        });
        if (res2.status === 'success') {
          res = { ...res, msg: `${res.msg} · Trasladado al piloto (en tránsito).` };
          estadoUndo = 'transito';
        } else {
          res = { ...res, status: 'warning', msg: `${res.msg} · Ingresado, pero NO se trasladó: ${res2.msg}` };
        }

        // Integración con DESPACHOS: crea (o reusa) la carga Z.14 → Xenacluster
        // (rollos) enlazada al expediente, para que acepte los QR de los rollos.
        // Usa la API key guardada en Configuración; si falla, el escaneo ya
        // quedó hecho y solo se avisa.
        const resCarga = await apiFetch('/api/despachos/carga', {
          method: 'POST',
          body: {
            barcode: codigoNormalizado,
            nueva: nuevaCarga,
            maxRollos: Number(maxRollos) || 0,
          },
        });
        if (resCarga.status === 'success') {
          res = { ...res, msg: `${res.msg} · ${resCarga.msg}` };
          setNuevaCarga(false); // la bandera era para ESTE escaneo
        } else if (resCarga.status !== 'info') {
          // 'info' = conexión sin configurar: no ensuciar cada escaneo con eso.
          res = { ...res, status: res.status === 'success' ? 'warning' : res.status, msg: `${res.msg} · ${resCarga.msg}` };
        }
      }

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

      if (res.status === 'success' || (fase === 'ingreso' && modo === 'trasladar' && res.status === 'warning')) {
        setContador((c) => c + 1);
        setPila((prev) => [{ codigo: entrada.codigo, estadoEsperado: estadoUndo }, ...prev].slice(0, MAX_UNDO));
      }
    },
    [procesando, fase, operador, modo, nuevaCarga, maxRollos, cfg.estadoDestino]
  );

  // Rechazo por rollo ya ingresado: el sticker igual se puede (re)imprimir.
  const yaRegistrado = /ya fue registrado/i.test(resultado?.msg || '');
  const codigoImprimible =
    resultado?.status === 'success' ? resultado?.detalles?.codigo || ultimoCodigo : yaRegistrado ? ultimoCodigo : '';

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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 pb-24 md:pb-16 space-y-4">
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

        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4 items-start">
          {/* ── Columna izquierda: captura ─────────────────────────────── */}
          <div className="space-y-4">
            {fase === 'ingreso' && (
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] font-semibold uppercase text-blue-700 mb-2">Modo de ingreso</p>
                <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setModo('bodega')}
                    className={`min-h-[40px] px-2 rounded-md text-sm font-semibold transition-colors ${
                      modo === 'bodega' ? 'bg-blue-800 text-white shadow-sm' : 'text-blue-900 hover:bg-white'
                    }`}
                  >
                    Solo a bodega
                  </button>
                  <button
                    type="button"
                    onClick={() => setModo('trasladar')}
                    className={`min-h-[40px] px-2 rounded-md text-sm font-semibold transition-colors ${
                      modo === 'trasladar' ? 'bg-amber-600 text-white shadow-sm' : 'text-blue-900 hover:bg-white'
                    }`}
                  >
                    Ingresar y trasladar
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {modo === 'bodega'
                    ? 'El rollo queda en Bodega Z14.'
                    : 'El rollo ingresa a Z14, queda cargado al piloto (en tránsito) y se asigna como bulto a la carga Z.14 → Xenacluster (rollos) en Despachos.'}
                </p>

                {modo === 'trasladar' && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="flex-1">
                        <span className="block text-[11px] font-semibold uppercase text-blue-700 mb-1">
                          Rollos por carga (opcional)
                        </span>
                        <input
                          type="number"
                          min="1"
                          value={maxRollos}
                          onChange={(e) => setMaxRollos(e.target.value)}
                          placeholder="Sin tope"
                          className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setNuevaCarga((v) => !v)}
                        title="El próximo escaneo abre otra carga (para repartir en 2+ cargas)"
                        className={`self-end min-h-[40px] px-3 rounded-lg text-sm font-semibold border transition-colors ${
                          nuevaCarga
                            ? 'bg-amber-600 border-amber-600 text-white'
                            : 'bg-white border-slate-200 text-blue-800 hover:bg-slate-50'
                        }`}
                      >
                        {nuevaCarga ? 'Nueva carga ✓' : 'Nueva carga'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">
                      {nuevaCarga
                        ? 'El PRÓXIMO escaneo abre una carga nueva (los siguientes siguen en ella).'
                        : maxRollos
                        ? `Al llegar a ${maxRollos} rollos, la siguiente carga se abre sola.`
                        : 'Todos los rollos del expediente van a la misma carga abierta.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
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
          </div>

          {/* ── Columna derecha: resultado + historial ─────────────────── */}
          <div className="space-y-4">
            <div ref={resultRef}>
              {resultado ? (
                <ScanResultCard resultado={resultado} fase={fase} />
              ) : (
                <div className="bg-white border border-dashed border-slate-300 rounded-xl px-6 py-10 text-center">
                  <ScanLine className="w-10 h-10 text-blue-200 mx-auto mb-3" aria-hidden="true" />
                  <p className="text-sm font-semibold text-blue-900">Listo para escanear</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Toma una foto del código, usa la cámara en vivo o escribe el código a mano. El resultado de cada
                    escaneo aparece aquí.
                  </p>
                </div>
              )}
            </div>

            {fase === 'ingreso' && resultado?.status === 'success' && resultado?.detalles?.globalFaltan === 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-green-800">
                  🎉 ¡Contenedor completo! Todos los rollos fueron recibidos.
                </p>
                <Link
                  href="/manifiesto"
                  className="flex items-center justify-center gap-1.5 min-h-[44px] px-4 bg-blue-800 hover:bg-blue-900 text-white text-sm font-semibold rounded-lg transition-colors shrink-0"
                >
                  <FileText className="w-4 h-4" aria-hidden="true" />
                  Generar manifiesto
                </Link>
              </div>
            )}

            {fase === 'ingreso' && codigoImprimible && (
              <PrintStickerButton
                barcodes={[codigoImprimible]}
                label={yaRegistrado ? 'Reimprimir sticker' : 'Imprimir sticker'}
              />
            )}

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setHistorialAbierto((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-blue-900"
              >
                Historial de sesión ({historial.length})
                {historialAbierto ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
              </button>
              {historialAbierto &&
                (historial.length === 0 ? (
                  <p className="border-t border-slate-100 px-4 py-6 text-center text-xs text-slate-400">
                    Aún no hay escaneos en esta sesión.
                  </p>
                ) : (
                  <ul className="border-t border-slate-100 divide-y divide-slate-100 max-h-80 overflow-y-auto">
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
                ))}
            </div>
          </div>
        </div>
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
