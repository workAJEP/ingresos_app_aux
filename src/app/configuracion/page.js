'use client';

// Apartado Configuración: estado/manejo de la impresión (cola de stickers) y
// administración de la conexión por API key (la key la genera OTRA app y aquí
// se pega y se guarda; nunca se vuelve a mostrar completa).
import { useCallback, useEffect, useState } from 'react';
import { Settings, Printer, KeyRound, RefreshCw, Eye, EyeOff, Save } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { apiFetch } from '@/components/useApi';

export default function ConfiguracionPage() {
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [apiKey, setApiKey] = useState('');
  const [verKey, setVerKey] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msgKey, setMsgKey] = useState(null); // { status, msg }

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    const res = await apiFetch('/api/config');
    if (res.status === 'error') setError(res.msg);
    else setData(res.detalles);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardarKey = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setGuardando(true);
    setMsgKey(null);
    const res = await apiFetch('/api/config', { method: 'POST', body: { apiKey: apiKey.trim() } });
    setGuardando(false);
    setMsgKey({ status: res.status, msg: res.msg });
    if (res.status === 'success') {
      setApiKey('');
      setVerKey(false);
      cargar();
    }
  };

  const imp = data?.impresion;
  const cx = data?.conexion;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-white border border-slate-200 rounded-xl">
        <div>
          <h1 className="text-xl font-semibold text-blue-900 flex items-center gap-2">
            <Settings className="w-[22px] h-[22px] text-blue-700" aria-hidden="true" />
            Configuración
          </h1>
          <p className="text-sm text-black mt-0.5">Impresión de stickers y conexión con otras apps</p>
        </div>
        <button
          type="button"
          onClick={cargar}
          disabled={cargando}
          className="flex items-center gap-1.5 bg-white border border-slate-200 text-blue-800 hover:bg-slate-50 text-sm font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Actualizar
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={cargar} />}

      {cargando && !data ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* ── Impresión ─────────────────────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-blue-900 flex items-center gap-2">
              <Printer className="w-5 h-5 text-blue-700" aria-hidden="true" />
              Impresión de stickers
            </h2>
            {imp?.error ? (
              <p className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                La cola de impresión no está accesible: {imp.error}
              </p>
            ) : imp ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Dato label="Backend" valor={imp.store === 'postgres' ? 'Postgres' : 'KV (legado)'} ok={imp.store === 'postgres'} />
                <Dato label="Servidor" valor={imp.host || '—'} />
                <Dato label="Pendientes" valor={String(imp.pendientes ?? imp.llen ?? 0)} />
                <Dato label="Histórico" valor={String(imp.total ?? '—')} />
              </div>
            ) : (
              <p className="text-sm text-slate-500">Sin información de la cola.</p>
            )}
            <p className="text-xs text-slate-500">
              Los trabajos los recoge el poller de la PC de la impresora (BarTender). Si &quot;Pendientes&quot; crece y no
              se imprime, revisa que el poller esté corriendo y con el token correcto.
            </p>
          </section>

          {/* ── Conexión (API key) ────────────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-blue-900 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-blue-700" aria-hidden="true" />
              Administrar conexión
            </h2>
            <p className="text-sm text-slate-500">
              Pega la <strong>API key</strong> generada por la otra app para habilitar la conexión. Se guarda en el
              servidor y nunca se vuelve a mostrar completa.
            </p>

            {cx?.apiKey ? (
              <div className="flex flex-wrap items-center gap-2 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span className="font-semibold text-blue-900">Key actual:</span>
                <span className="font-mono">{cx.apiKey}</span>
                {cx.actualizado && (
                  <span className="text-xs text-slate-500">
                    · actualizada {new Date(cx.actualizado).toLocaleString('es-GT')}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Aún no hay API key guardada.
              </p>
            )}

            {/* Solo se declara "falta DATABASE_URL" con datos CARGADOS: si el GET
                falló (data null) el aviso correcto es el banner de error de arriba. */}
            {data && !cx?.disponible ? (
              <p className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                No hay dónde guardar la configuración: falta DATABASE_URL (Postgres) en este entorno (revisa que la
                variable exista también en Preview/Development de Vercel o en .env.local).
              </p>
            ) : (
              <form onSubmit={guardarKey} className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <input
                    type={verKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Pega aquí la API key de la otra app…"
                    autoComplete="off"
                    className="w-full min-h-[48px] pl-3 pr-11 py-2 text-sm font-mono border border-slate-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setVerKey((v) => !v)}
                    aria-label={verKey ? 'Ocultar key' : 'Mostrar key'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    {verKey ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={guardando || !apiKey.trim()}
                  className="flex items-center justify-center gap-1.5 min-h-[48px] px-5 bg-blue-800 hover:bg-blue-900 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {guardando ? <Spinner size="sm" className="text-white" /> : <Save className="w-4 h-4" aria-hidden="true" />}
                  Guardar
                </button>
              </form>
            )}

            {msgKey && (
              <p
                className={`text-sm font-semibold border rounded-lg px-3 py-2 ${
                  msgKey.status === 'success'
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {msgKey.msg}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Dato({ label, valor, ok }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
      <p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p>
      <p className={`text-sm font-bold truncate ${ok === undefined ? 'text-blue-900' : ok ? 'text-green-700' : 'text-amber-700'}`}>
        {valor}
      </p>
    </div>
  );
}
