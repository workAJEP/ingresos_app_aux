'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutDashboard, Search, Download, Warehouse, Truck, PackageCheck, Boxes } from 'lucide-react';
import ImportacionPicker from '@/components/ImportacionPicker';
import DonutEstados from '@/components/DonutEstados';
import StatCard from '@/components/ui/StatCard';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorBanner from '@/components/ui/ErrorBanner';
import Badge from '@/components/ui/Badge';
import { apiFetch } from '@/components/useApi';

const REFRESH_MS = 60000;

export default function DashboardPage() {
  const [importacionId, setImportacionId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const intervalRef = useRef(null);

  const cargar = useCallback(async () => {
    setError('');
    const qs = importacionId ? `?importacionId=${importacionId}` : '';
    const res = await apiFetch(`/api/odoo/dashboard${qs}`);
    if (res.status === 'error') {
      setError(res.msg);
    } else {
      setData(res.detalles);
    }
    setLoading(false);
  }, [importacionId]);

  useEffect(() => {
    setLoading(true);
    cargar();
  }, [cargar]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') cargar();
    };
    intervalRef.current = setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [cargar]);

  const filas = (data?.rows || []).filter((r) => {
    const texto = busqueda.trim().toLowerCase();
    const coincideTexto =
      !texto ||
      r.codigo?.toLowerCase().includes(texto) ||
      r.nombre?.toLowerCase().includes(texto) ||
      r.codigoDist?.toLowerCase().includes(texto);
    const coincideEstado = !filtroEstado || r.estado === filtroEstado;
    return coincideTexto && coincideEstado;
  });

  const stats = data?.stats;
  const conteoPorEstado = (data?.rows || []).reduce((acc, r) => {
    acc[r.estado] = (acc[r.estado] || 0) + 1;
    return acc;
  }, {});

  const exportar = () => {
    const qs = new URLSearchParams({ tipo: 'inventario' });
    if (importacionId) qs.set('importacionId', importacionId);
    window.location.href = `/api/odoo/export?${qs.toString()}`;
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-white border border-slate-200 rounded-xl">
        <div>
          <h1 className="text-xl font-semibold text-blue-900 flex items-center gap-2">
            <LayoutDashboard className="w-[22px] h-[22px] text-blue-700" aria-hidden="true" />
            Dashboard
          </h1>
          <p className="text-sm text-black mt-0.5">Inventario en vivo por expediente</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <ImportacionPicker value={importacionId} onChange={setImportacionId} />
          <button
            type="button"
            onClick={exportar}
            className="flex items-center gap-1.5 bg-blue-800 hover:bg-blue-900 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Exportar CSV
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={cargar} />}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={Warehouse} label="En bodega Z14" value={stats?.enBodegaZ14 ?? 0} accent="blue" />
            <StatCard icon={Truck} label="Enviados hoy" value={stats?.enviadosHoy ?? 0} accent="amber" />
            <StatCard icon={PackageCheck} label="Recibidos hoy Xena" value={stats?.recibidosHoyXena ?? 0} accent="green" />
            <StatCard icon={Boxes} label="Total Xena" value={stats?.totalXena ?? 0} accent="blue" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-blue-900 mb-2">Distribución por estado</p>
              <div className="h-56 sm:h-64">
                <DonutEstados
                  data={{
                    bodega: conteoPorEstado.bodega ?? 0,
                    transito: conteoPorEstado.transito ?? 0,
                    recibido: conteoPorEstado.recibido ?? 0,
                    pendiente: stats?.pendientes ?? 0,
                  }}
                />
              </div>
            </div>

            <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 p-3 border-b border-slate-100">
                <div className="relative flex-1 min-w-0 sm:min-w-[180px]">
                  <Search className="w-3.5 h-3.5 text-blue-700 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar código o artículo…"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <select
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                  className="w-full sm:w-auto appearance-none bg-gray-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-blue-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                >
                  <option value="">Todos los estados</option>
                  <option value="bodega">En bodega</option>
                  <option value="transito">En tránsito</option>
                  <option value="recibido">Recibido</option>
                </select>
              </div>

              <div className="overflow-x-auto overflow-y-auto max-h-[420px]">
                {filas.length === 0 ? (
                  <EmptyState title="Sin resultados" description="No hay rollos que coincidan con el filtro." />
                ) : (
                  <table className="w-full min-w-[560px] text-sm text-left">
                    <thead className="bg-white text-blue-700 border-b border-slate-200 sticky top-0">
                      <tr className="divide-x divide-slate-200">
                        <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Código</th>
                        <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Artículo</th>
                        <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right whitespace-nowrap">Mts</th>
                        <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right whitespace-nowrap">Yds</th>
                        <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((r) => (
                        <tr key={r.id} className="border-b border-slate-100 divide-x divide-slate-100 hover:bg-blue-50/40 transition-colors">
                          <td className="px-4 py-2.5 font-mono tabular-nums text-blue-900 whitespace-nowrap">{r.codigo}</td>
                          <td className="px-4 py-2.5 text-blue-900 whitespace-nowrap">
                            {r.nombre} <span className="text-slate-400">({r.codigoDist})</span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-blue-900 whitespace-nowrap">{r.metros}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-blue-900 whitespace-nowrap">{r.yardas}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <Badge estado={r.estado} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
