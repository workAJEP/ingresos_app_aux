'use client';

import { useCallback, useEffect, useState } from 'react';
import { Boxes, PlusCircle, RefreshCw } from 'lucide-react';
import UploadContenedor from '@/components/UploadContenedor';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { apiFetch } from '@/components/useApi';
import { useOperador } from '@/components/OperadorGate';

export default function ContenedoresPage() {
  const { operador } = useOperador();
  const [importaciones, setImportaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadAbierto, setUploadAbierto] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await apiFetch('/api/odoo/importaciones');
    if (res.status === 'error') {
      setError(res.msg);
    } else {
      setImportaciones(res.detalles?.importaciones || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-white border border-slate-200 rounded-xl">
        <div>
          <h1 className="text-xl font-semibold text-blue-900 flex items-center gap-2">
            <Boxes className="w-[22px] h-[22px] text-blue-700" aria-hidden="true" />
            Contenedores
          </h1>
          <p className="text-sm text-black mt-0.5">Expedientes de importación y carga de packing list</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cargar}
            className="p-2 rounded-lg text-blue-700 hover:bg-blue-50 transition-colors"
            aria-label="Actualizar"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setUploadAbierto(true)}
            className="flex items-center gap-1.5 bg-blue-800 hover:bg-blue-900 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            <PlusCircle className="w-4 h-4" aria-hidden="true" />
            Cargar contenedor
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={cargar} />}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : importaciones.length === 0 ? (
        <EmptyState title="Sin expedientes" description="Crea un expediente cargando un packing list." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {importaciones.map((imp) => (
            <ExpedienteCard key={imp.id} imp={imp} />
          ))}
        </div>
      )}

      <UploadContenedor open={uploadAbierto} onClose={() => setUploadAbierto(false)} operador={operador} onUploaded={cargar} />
    </div>
  );
}

function ExpedienteCard({ imp }) {
  const total = imp.rollosTotal || 0;
  const segmentos = [
    { valor: imp.rollosRecibidos, color: 'bg-green-600' },
    { valor: imp.rollosTransito, color: 'bg-amber-500' },
    { valor: imp.rollosBodega, color: 'bg-blue-800' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-base font-semibold text-blue-900 truncate">{imp.name}</p>
        <p className="text-xs text-slate-500 truncate">
          {imp.descripcion}
          {imp.contenedor ? ` · ${imp.contenedor}` : ''}
        </p>
      </div>

      <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
        {total > 0 &&
          segmentos.map(
            (s, i) => s.valor > 0 && <div key={i} className={s.color} style={{ width: `${(s.valor / total) * 100}%` }} />
          )}
      </div>

      <div className="grid grid-cols-4 gap-1 text-center text-xs">
        <Contador label="Pend." valor={imp.rollosPendientes} />
        <Contador label="Bodega" valor={imp.rollosBodega} />
        <Contador label="Tránsito" valor={imp.rollosTransito} />
        <Contador label="Recibido" valor={imp.rollosRecibidos} />
      </div>

      <p className="text-xs text-slate-400">
        Total: <span className="font-semibold text-slate-600 tabular-nums">{total}</span> rollos
      </p>
    </div>
  );
}

function Contador({ label, valor }) {
  return (
    <div>
      <p className="font-bold text-blue-900 tabular-nums">{valor ?? 0}</p>
      <p className="text-[10px] text-slate-400 uppercase">{label}</p>
    </div>
  );
}
