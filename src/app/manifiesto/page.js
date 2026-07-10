'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { apiFetch } from '@/components/useApi';

function hoyISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

export default function ManifiestoPage() {
  const [fecha, setFecha] = useState(hoyISO());
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await apiFetch(`/api/odoo/manifest?fecha=${fecha}`);
    if (res.status === 'error') {
      setError(res.msg);
      setDatos(null);
    } else {
      setDatos(res.detalles || { fecha, rows: [], totales: { peso: 0, metros: 0, yardas: 0, rollos: 0 } });
    }
    setLoading(false);
  }, [fecha]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filas = datos?.rows || [];
  const totales = datos?.totales || { peso: 0, metros: 0, yardas: 0, rollos: 0 };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-white border border-slate-200 rounded-xl">
        <div>
          <h1 className="text-xl font-semibold text-blue-900 flex items-center gap-2">
            <FileText className="w-[22px] h-[22px] text-blue-700" aria-hidden="true" />
            Manifiesto de carga
          </h1>
          <p className="text-sm text-black mt-0.5">Ruta piloto por fecha de despacho</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
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

      {loading ? (
        <div className="no-print flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : filas.length === 0 ? (
        <div className="no-print">
          <EmptyState title="Sin rollos en tránsito" description="No hay rollos cargados en tránsito ese día." />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-center hidden print:block">
            <h2 className="text-lg font-bold text-black">MANIFIESTO DE CARGA — RUTA PILOTO</h2>
            <p className="text-sm text-black">Fecha de emisión: {fecha}</p>
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
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Número (ID)</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right">Peso Neto (kg)</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right">Cant. Metros</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right">Cant. Yardas</th>
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
            <span className="text-sm text-slate-500">Total de bultos/rollos:</span>
            <span className="text-lg font-bold text-blue-900 tabular-nums">{totales.rollos}</span>
          </div>
        </div>
      )}
    </div>
  );
}
