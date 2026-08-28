'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Boxes, RefreshCw, Tags } from 'lucide-react';
import RollosAdmin from '@/components/RollosAdmin';
import PrintStickerButton from '@/components/PrintStickerButton';
import ArticulosEditor from '@/components/ArticulosEditor';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { apiFetch } from '@/components/useApi';

/**
 * Detalle de un expediente: todo lo que antes vivía en los botones de la card
 * (imprimir, datos de etiqueta, administrar rollos) vive aquí adentro.
 */
export default function ExpedientePage() {
  const params = useParams();
  const importacionId = Number(params?.id);
  const [imp, setImp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editorAbierto, setEditorAbierto] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await apiFetch('/api/odoo/importaciones');
    if (res.status === 'error') {
      setError(res.msg);
    } else {
      const encontrada = (res.detalles?.importaciones || []).find((i) => i.id === importacionId);
      setImp(encontrada || null);
    }
    setLoading(false);
  }, [importacionId]);

  useEffect(() => {
    if (importacionId) cargar();
  }, [importacionId, cargar]);

  const total = imp?.rollosTotal || 0;
  const segmentos = [
    { valor: imp?.rollosRecibidos, color: 'bg-green-600' },
    { valor: imp?.rollosTransito, color: 'bg-amber-500' },
    { valor: imp?.rollosBodega, color: 'bg-blue-800' },
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-white border border-slate-200 rounded-xl">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/contenedores"
            aria-label="Volver a contenedores"
            className="p-2 rounded-lg text-blue-700 hover:bg-blue-50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-blue-900 flex items-center gap-2 truncate">
              <Boxes className="w-[22px] h-[22px] text-blue-700 shrink-0" aria-hidden="true" />
              {imp?.name || 'Expediente'}
            </h1>
            <p className="text-sm text-black mt-0.5 truncate">
              {imp?.descripcion}
              {imp?.contenedor ? ` · ${imp.contenedor}` : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={cargar}
          className="p-2 rounded-lg text-blue-700 hover:bg-blue-50 transition-colors"
          aria-label="Actualizar"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={cargar} />}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : !imp ? (
        <EmptyState title="Expediente no encontrado" description="Puede estar cerrado o cancelado." />
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-3">
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
              {total > 0 &&
                segmentos.map(
                  (s, i) =>
                    s.valor > 0 && <div key={i} className={s.color} style={{ width: `${(s.valor / total) * 100}%` }} />,
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

            {total > 0 && (
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <PrintStickerButton
                  chooser
                  importacionId={imp.id}
                  count={total - (imp.rollosPendientes || 0)}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => setEditorAbierto(true)}
                  className="flex items-center justify-center gap-1.5 min-h-[52px] w-full sm:w-auto px-4 bg-white border border-slate-200 text-blue-800 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-colors"
                >
                  <Tags className="w-4 h-4" aria-hidden="true" />
                  Datos de etiqueta
                </button>
              </div>
            )}
          </div>

          <RollosAdmin
            embedded
            importacionId={imp.id}
            expedienteName={imp.name}
            onChanged={cargar}
          />

          <ArticulosEditor
            open={editorAbierto}
            importacionId={imp.id}
            expedienteName={imp.name}
            onClose={() => setEditorAbierto(false)}
            onSaved={cargar}
          />
        </>
      )}
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
