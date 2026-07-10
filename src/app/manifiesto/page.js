'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, Printer } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorBanner from '@/components/ui/ErrorBanner';
import ImportacionPicker from '@/components/ImportacionPicker';
import { apiFetch } from '@/components/useApi';

function ManifiestoContent() {
  const searchParams = useSearchParams();
  const initialId = searchParams.get('importacionId');

  const [importacionId, setImportacionId] = useState(initialId ? Number(initialId) : null);
  const [datos, setDatos] = useState(null);
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(!!initialId);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!importacionId) {
      setDatos(null);
      setInfoMsg('');
      return;
    }
    setLoading(true);
    setError('');
    setInfoMsg('');
    const res = await apiFetch(`/api/odoo/manifest?importacionId=${importacionId}`);
    if (res.status === 'error') {
      setError(res.msg);
      setDatos(null);
    } else if (res.status === 'info') {
      setInfoMsg(res.msg || 'No hay rollos verificados para este expediente.');
      setDatos(null);
    } else {
      setDatos(res.detalles || null);
    }
    setLoading(false);
  }, [importacionId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filas = datos?.rows || [];
  const totales = datos?.totales || { peso: 0, metros: 0, yardas: 0, rollos: 0 };
  const expedienteNombre = datos?.expediente;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-white border border-slate-200 rounded-xl">
        <div>
          <h1 className="text-xl font-semibold text-blue-900 flex items-center gap-2">
            <FileText className="w-[22px] h-[22px] text-blue-700" aria-hidden="true" />
            Manifiesto de recepción{expedienteNombre ? ` — ${expedienteNombre}` : ''}
          </h1>
          <p className="text-sm text-black mt-0.5">Manifiesto por expediente (Ingreso Z14)</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportacionPicker value={importacionId} onChange={setImportacionId} allowAll={false} />
          <button
            type="button"
            onClick={() => window.print()}
            disabled={filas.length === 0}
            className="flex items-center gap-1.5 bg-blue-800 hover:bg-blue-900 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            Imprimir
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={cargar} className="no-print" />}

      {!importacionId ? (
        <div className="no-print">
          <EmptyState title="Selecciona un expediente" description="Elige un expediente para ver su manifiesto de recepción." />
        </div>
      ) : loading ? (
        <div className="no-print flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : infoMsg ? (
        <div className="no-print">
          <EmptyState title="Sin rollos verificados" description={infoMsg} />
        </div>
      ) : filas.length === 0 ? (
        <div className="no-print">
          <EmptyState title="Sin rollos verificados" description="No hay rollos verificados para este expediente." />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-center hidden print:block">
            <h2 className="text-lg font-bold text-black">MANIFIESTO DE RECEPCIÓN</h2>
            {expedienteNombre && <p className="text-sm text-black">Expediente: {expedienteNombre}</p>}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white text-blue-700 border-b border-slate-200">
                <tr className="divide-x divide-slate-200">
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Pieza</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Código Dist</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Color</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Composición</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Número mono</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right">Peso kg</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right">Mts</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right">Yds</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((r, i) => (
                  <tr key={r.codigo || i} className="border-b border-slate-100 divide-x divide-slate-100 hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-2.5 font-semibold text-blue-900">{r.pieza}</td>
                    <td className="px-4 py-2.5 text-blue-900">{r.codigoDist}</td>
                    <td className="px-4 py-2.5 text-blue-900">{r.nombre}</td>
                    <td className="px-4 py-2.5 text-blue-900">{r.color}</td>
                    <td className="px-4 py-2.5 text-blue-900">{r.composicion}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-blue-900">{r.codigo}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-blue-900">{r.pesoNeto}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-blue-900">{r.metros}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-blue-900">{r.yardas}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold divide-x divide-slate-100">
                  <td className="px-4 py-2.5 text-blue-900" colSpan={6}>
                    TOTALES
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-blue-900">{totales.peso}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-blue-900">{totales.metros}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-blue-900">{totales.yardas}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 inline-flex items-center gap-2">
            <span className="text-sm text-slate-500">Total de rollos:</span>
            <span className="text-lg font-bold text-blue-900 tabular-nums">{totales.rollos}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ManifiestoPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-10 text-center text-sm text-slate-400">Cargando…</div>}>
      <ManifiestoContent />
    </Suspense>
  );
}
