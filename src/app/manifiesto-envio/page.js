'use client';

// Manifiesto de ENVÍO: se arma escaneando el barcode de cada rollo. Solo
// acepta rollos YA INGRESADOS (estado != pendiente) — la validación la hace
// /api/odoo/manifiesto-envio. El yardaje del listado sale con la MISMA
// conversión de los stickers (metros × 1.09361), así ambos concuerdan.
import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { Truck, ArrowLeft, Printer, Trash2, FileText } from 'lucide-react';
import BarcodeScanner from '@/components/BarcodeScanner';
import ImportacionPicker from '@/components/ImportacionPicker';
import EmptyState from '@/components/ui/EmptyState';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { apiFetch } from '@/components/useApi';
import { normalizarBarcode } from '@/lib/barcode';
import { beep } from '@/lib/beep';

export default function ManifiestoEnvioPage() {
  const [importacionId, setImportacionId] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [rollos, setRollos] = useState([]);
  const [aviso, setAviso] = useState(null); // { status, msg }
  const inputRef = useRef(null);

  const procesar = useCallback(
    async (crudo) => {
      if (procesando) return;
      const norm = normalizarBarcode(crudo);
      if (!norm.ok) {
        setAviso({ status: 'error', msg: norm.error || 'Código inválido.' });
        beep('error');
        return;
      }
      const bc = norm.codigo;
      if (rollos.some((r) => r.codigo === bc)) {
        setAviso({ status: 'info', msg: `Rollo ${bc} ya está en el manifiesto.` });
        beep('error');
        return;
      }
      setProcesando(true);
      const qs = new URLSearchParams({ barcode: bc });
      if (importacionId) qs.set('importacionId', importacionId);
      const res = await apiFetch(`/api/odoo/manifiesto-envio?${qs.toString()}`);
      setProcesando(false);
      setCodigo('');
      inputRef.current?.focus();

      beep(res.status === 'success' ? 'success' : 'error');
      setAviso({ status: res.status, msg: res.msg });
      if (res.status === 'success' && res.detalles?.rollo) {
        setRollos((prev) => [...prev, res.detalles.rollo]);
      }
    },
    [procesando, rollos, importacionId]
  );

  const onManualSubmit = (e) => {
    e.preventDefault();
    if (!codigo.trim()) return;
    procesar(codigo);
  };

  const quitar = (bc) => setRollos((prev) => prev.filter((r) => r.codigo !== bc));

  const totales = rollos.reduce(
    (acc, r) => {
      acc.peso += Number(r.pesoNeto) || 0;
      acc.metros += Number(r.metros) || 0;
      acc.yardas += Number(r.yardas) || 0;
      return acc;
    },
    { peso: 0, metros: 0, yardas: 0 }
  );
  const f2 = (n) => n.toFixed(2);

  const AVISO_ESTILOS = {
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    error: 'bg-red-50 border-red-200 text-red-800',
  };

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6 space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-white border border-slate-200 rounded-xl">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/dashboard" aria-label="Volver al dashboard" className="shrink-0 p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-blue-800" aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-blue-900 flex items-center gap-2">
              <Truck className="w-[22px] h-[22px] text-blue-700" aria-hidden="true" />
              Manifiesto de envío
            </h1>
            <p className="text-sm text-black mt-0.5">Escanea los rollos ingresados que van en el envío</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ImportacionPicker value={importacionId} onChange={setImportacionId} />
          <button
            type="button"
            onClick={() => window.print()}
            disabled={rollos.length === 0}
            className="flex items-center gap-1.5 bg-blue-800 hover:bg-blue-900 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            Imprimir
          </button>
        </div>
      </div>

      <div className="no-print grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
        <div className="space-y-3 bg-white border border-slate-200 rounded-xl p-4">
          <BarcodeScanner onDetected={procesar} disabled={procesando} />
          <form onSubmit={onManualSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Código del rollo…"
              disabled={procesando}
              className="flex-1 w-full min-h-[48px] px-3 py-2 text-base border border-slate-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={procesando || !codigo.trim()}
              className="min-h-[48px] px-4 bg-blue-800 hover:bg-blue-900 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              Agregar
            </button>
          </form>
          {aviso && (
            <p className={`text-sm font-semibold border rounded-lg px-3 py-2 ${AVISO_ESTILOS[aviso.status] || AVISO_ESTILOS.info}`}>
              {aviso.msg}
            </p>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-blue-900 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-blue-700" aria-hidden="true" />
              Rollos en el manifiesto
            </p>
            <span className="text-lg font-bold text-blue-900 tabular-nums">{rollos.length}</span>
          </div>
          {rollos.length === 0 ? (
            <EmptyState title="Sin rollos" description="Escanea un rollo ingresado para agregarlo al manifiesto." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm text-left">
                <thead className="bg-white text-blue-700 border-b border-slate-200">
                  <tr className="divide-x divide-slate-200">
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Código</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Código de tela</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Descripción</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right whitespace-nowrap">Yardas</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right whitespace-nowrap">Metros</th>
                    <th className="px-2 py-3 no-print" aria-label="Quitar" />
                  </tr>
                </thead>
                <tbody>
                  {rollos.map((r) => (
                    <tr key={r.codigo} className="border-b border-slate-100 divide-x divide-slate-100 hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-2.5 font-mono tabular-nums text-blue-900 whitespace-nowrap">{r.codigo}</td>
                      <td className="px-4 py-2.5 text-blue-900 whitespace-nowrap">{r.codigoTela}</td>
                      <td className="px-4 py-2.5 text-blue-900">
                        {r.descripcion} {r.color && <span className="text-slate-500">· {r.color}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-blue-900">{r.yardas}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-blue-900">{r.metros}</td>
                      <td className="px-2 py-2.5 no-print">
                        <button
                          type="button"
                          onClick={() => quitar(r.codigo)}
                          aria-label={`Quitar ${r.codigo}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold divide-x divide-slate-100">
                    <td className="px-4 py-2.5 text-blue-900" colSpan={3}>
                      TOTALES ({rollos.length} rollos)
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-blue-900">{f2(totales.yardas)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-blue-900">{f2(totales.metros)}</td>
                    <td className="no-print" />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Versión imprimible */}
      {rollos.length > 0 && (
        <div className="hidden print:block space-y-3">
          <div className="text-center">
            <h2 className="text-lg font-bold text-black">MANIFIESTO DE ENVÍO</h2>
            {rollos[0]?.expediente && <p className="text-sm text-black">Expediente: {rollos[0].expediente}</p>}
            <p className="text-xs text-black">{new Date().toLocaleString('es-GT')}</p>
          </div>
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr>
                <th className="border border-black px-2 py-1">Código</th>
                <th className="border border-black px-2 py-1">Código de tela</th>
                <th className="border border-black px-2 py-1">Descripción</th>
                <th className="border border-black px-2 py-1 text-right">Yardas</th>
                <th className="border border-black px-2 py-1 text-right">Metros</th>
              </tr>
            </thead>
            <tbody>
              {rollos.map((r) => (
                <tr key={r.codigo}>
                  <td className="border border-black px-2 py-1 font-mono">{r.codigo}</td>
                  <td className="border border-black px-2 py-1">{r.codigoTela}</td>
                  <td className="border border-black px-2 py-1">
                    {r.descripcion}
                    {r.color ? ` · ${r.color}` : ''}
                  </td>
                  <td className="border border-black px-2 py-1 text-right font-mono">{r.yardas}</td>
                  <td className="border border-black px-2 py-1 text-right font-mono">{r.metros}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="border border-black px-2 py-1" colSpan={3}>
                  TOTALES ({rollos.length} rollos)
                </td>
                <td className="border border-black px-2 py-1 text-right font-mono">{f2(totales.yardas)}</td>
                <td className="border border-black px-2 py-1 text-right font-mono">{f2(totales.metros)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
