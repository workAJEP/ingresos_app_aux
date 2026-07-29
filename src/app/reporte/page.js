'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Search, Download, Printer, RefreshCw, Warehouse, Truck, PackageCheck, Boxes } from 'lucide-react';
import ImportacionPicker from '@/components/ImportacionPicker';
import StatCard from '@/components/ui/StatCard';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorBanner from '@/components/ui/ErrorBanner';
import Badge from '@/components/ui/Badge';
import { apiFetch } from '@/components/useApi';

// "2026-07-28 14:03:22" -> "28/07/2026 14:03"
function fmtFecha(f) {
  if (!f) return '';
  const s = String(f);
  const [fecha, hora] = s.split(' ');
  if (!fecha || !fecha.includes('-')) return s;
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}${hora ? ` ${hora.slice(0, 5)}` : ''}`;
}

function CeldaFase({ fecha, operador }) {
  if (!fecha) return <span className="text-slate-300">—</span>;
  return (
    <div className="leading-tight">
      <p className="tabular-nums whitespace-nowrap">{fmtFecha(fecha)}</p>
      {operador ? <p className="text-xs text-slate-400 truncate">{operador}</p> : null}
    </div>
  );
}

export default function ReportePage() {
  const [importacionId, setImportacionId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  const cargar = useCallback(async () => {
    setError('');
    const qs = new URLSearchParams();
    if (importacionId) qs.set('importacionId', importacionId);
    if (filtroEstado) qs.set('estado', filtroEstado);
    const res = await apiFetch(`/api/odoo/reporte${qs.toString() ? `?${qs.toString()}` : ''}`);
    if (res.status === 'error') {
      setError(res.msg);
    } else {
      setData(res.detalles);
    }
    setLoading(false);
  }, [importacionId, filtroEstado]);

  useEffect(() => {
    setLoading(true);
    cargar();
  }, [cargar]);

  const filas = (data?.rows || []).filter((r) => {
    const texto = busqueda.trim().toLowerCase();
    return (
      !texto ||
      r.codigo?.toLowerCase().includes(texto) ||
      r.nombre?.toLowerCase().includes(texto) ||
      r.codigoDist?.toLowerCase().includes(texto) ||
      r.color?.toLowerCase().includes(texto) ||
      r.expediente?.toLowerCase().includes(texto) ||
      r.proveedor?.toLowerCase().includes(texto)
    );
  });

  const totales = data?.totales;

  // Totales de lo visible (la búsqueda filtra en cliente; si no hay filtro
  // coinciden con los del servidor).
  const sumaVisible = filas.reduce(
    (acc, r) => {
      acc.peso += Number(r.pesoNeto) || 0;
      acc.metros += Number(r.metros) || 0;
      acc.yardas += Number(r.yardas) || 0;
      return acc;
    },
    { peso: 0, metros: 0, yardas: 0 },
  );

  const exportar = () => {
    const qs = new URLSearchParams({ tipo: 'inventario' });
    if (importacionId) qs.set('importacionId', importacionId);
    window.location.href = `/api/odoo/export?${qs.toString()}`;
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6 space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-white border border-slate-200 rounded-xl">
        <div>
          <h1 className="text-xl font-semibold text-blue-900 flex items-center gap-2">
            <ClipboardList className="w-[22px] h-[22px] text-blue-700" aria-hidden="true" />
            Reporte de escaneados
          </h1>
          <p className="text-sm text-black mt-0.5">Rollos ya escaneados con toda su información y trazabilidad por fase</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <ImportacionPicker value={importacionId} onChange={setImportacionId} />
          <button
            type="button"
            onClick={cargar}
            className="flex items-center justify-center gap-1.5 bg-white border border-slate-200 text-blue-800 hover:bg-slate-50 text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Actualizar
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center justify-center gap-1.5 bg-white border border-slate-200 text-blue-800 hover:bg-slate-50 text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            Imprimir
          </button>
          <button
            type="button"
            onClick={exportar}
            className="flex items-center justify-center gap-1.5 bg-blue-800 hover:bg-blue-900 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Encabezado visible solo al imprimir */}
      <div className="hidden print:block">
        <h1 className="text-lg font-semibold text-blue-900">Reporte de rollos escaneados</h1>
        <p className="text-sm text-slate-600">
          {totales ? `${totales.rollos} rollos · ${totales.peso} kg · ${totales.metros} mts · ${totales.yardas} yds` : ''}
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={cargar} />}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <div className="no-print grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={Boxes} label="Total escaneados" value={totales?.rollos ?? 0} accent="blue" />
            <StatCard icon={Warehouse} label="En bodega Z14" value={totales?.porEstado?.bodega ?? 0} accent="blue" />
            <StatCard icon={Truck} label="En tránsito" value={totales?.porEstado?.transito ?? 0} accent="amber" />
            <StatCard icon={PackageCheck} label="Recibidos Xena" value={totales?.porEstado?.recibido ?? 0} accent="green" />
          </div>

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
            <div className="no-print flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 p-3 border-b border-slate-100">
              <div className="relative flex-1 min-w-0 sm:min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-blue-700 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar código, artículo, color, expediente…"
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
              {data?.truncado && (
                <p className="text-xs text-amber-700 font-semibold">Mostrando los primeros 5000 rollos.</p>
              )}
            </div>

            <div className="overflow-x-auto">
              {filas.length === 0 ? (
                <EmptyState title="Sin rollos escaneados" description="No hay rollos que coincidan con el filtro." />
              ) : (
                <table className="w-full min-w-[1100px] text-sm text-left">
                  <thead className="bg-white text-blue-700 border-b border-slate-200 sticky top-0">
                    <tr className="divide-x divide-slate-200">
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Código</th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Pieza</th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Artículo</th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Color</th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Composición</th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider text-right whitespace-nowrap">Peso kg</th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider text-right whitespace-nowrap">Mts</th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider text-right whitespace-nowrap">Yds</th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Estado</th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Ingreso Z14</th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Piloto</th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Xena</th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Expediente</th>
                      <th className="px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Proveedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 divide-x divide-slate-100 hover:bg-blue-50/40 transition-colors align-top">
                        <td className="px-3 py-2.5 font-mono tabular-nums text-blue-900 whitespace-nowrap">{r.codigo}</td>
                        <td className="px-3 py-2.5 text-blue-900 whitespace-nowrap">{r.pieza}</td>
                        <td className="px-3 py-2.5 text-blue-900 whitespace-nowrap">
                          {r.nombre} <span className="text-slate-400">({r.codigoDist})</span>
                        </td>
                        <td className="px-3 py-2.5 text-blue-900 whitespace-nowrap">{r.color}</td>
                        <td className="px-3 py-2.5 text-blue-900 whitespace-nowrap">{r.composicion}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-blue-900 whitespace-nowrap">{r.pesoNeto}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-blue-900 whitespace-nowrap">{r.metros}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-blue-900 whitespace-nowrap">{r.yardas}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <Badge estado={r.estado} />
                        </td>
                        <td className="px-3 py-2.5 text-blue-900">
                          <CeldaFase fecha={r.fechaZ14} operador={r.operadorZ14} />
                        </td>
                        <td className="px-3 py-2.5 text-blue-900">
                          <CeldaFase fecha={r.fechaPiloto} operador={r.operadorPiloto} />
                        </td>
                        <td className="px-3 py-2.5 text-blue-900">
                          <CeldaFase fecha={r.fechaXena} operador={r.operadorXena} />
                        </td>
                        <td className="px-3 py-2.5 text-blue-900 whitespace-nowrap">{r.expediente}</td>
                        <td className="px-3 py-2.5 text-blue-900 whitespace-nowrap">{r.proveedor}</td>
                      </tr>
                    ))}
                  </tbody>
                  {totales && (
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr className="divide-x divide-slate-100 font-semibold text-blue-900">
                        <td className="px-3 py-2.5 whitespace-nowrap" colSpan={5}>
                          Totales ({filas.length === totales.rollos ? totales.rollos : `${filas.length} de ${totales.rollos}`} rollos)
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{sumaVisible.peso.toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{sumaVisible.metros.toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">{sumaVisible.yardas.toFixed(2)}</td>
                        <td className="px-3 py-2.5" colSpan={6} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
