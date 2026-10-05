'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Boxes,
  PlusCircle,
  RefreshCw,
  FolderCog,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Container,
  Building2,
} from 'lucide-react';
import UploadContenedor from '@/components/UploadContenedor';
import ArticulosEditor from '@/components/ArticulosEditor';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { apiFetch } from '@/components/useApi';
import { useOperador } from '@/components/OperadorGate';

const POR_PAGINA = 12;

// Estados del EXPEDIENTE (distefano.importacion.state), en el orden del flujo.
const ESTADOS_EXP = [
  { id: 'borrador', label: 'Borrador', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  { id: 'pedido', label: 'Pedido', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'transito', label: 'Tránsito', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  { id: 'arribado', label: 'Arribado', cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  { id: 'bodega', label: 'Bodega', cls: 'bg-blue-800 text-white border-blue-800' },
  { id: 'cerrado', label: 'Cerrado', cls: 'bg-green-100 text-green-700 border-green-200' },
  { id: 'cancelado', label: 'Cancelado', cls: 'bg-red-50 text-red-600 border-red-200' },
];
const ESTADO_POR_ID = Object.fromEntries(ESTADOS_EXP.map((e) => [e.id, e]));

const ORDENES = [
  { id: 'nuevos', label: 'Más nuevos' },
  { id: 'viejos', label: 'Más viejos' },
  { id: 'rollos', label: 'Más rollos' },
];

// Búsqueda sin acentos ni mayúsculas ("transito" encuentra "Tránsito").
function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export default function ContenedoresPage() {
  const { operador } = useOperador();
  const [importaciones, setImportaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadAbierto, setUploadAbierto] = useState(false);
  const [articulosEditor, setArticulosEditor] = useState(null); // { importacionId, expedienteName } | null
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('todos');
  const [orden, setOrden] = useState('nuevos');
  const [pagina, setPagina] = useState(1);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    // todos=1: trae TODOS los expedientes (también cerrados y cancelados);
    // el filtro por estado y la búsqueda son locales e instantáneos.
    const res = await apiFetch('/api/odoo/importaciones?todos=1');
    if (res.status === 'error') {
      setError(res.msg);
    } else {
      setImportaciones(res.detalles?.importaciones || []);
    }
    setLoading(false);
    return res;
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Tras subir un packing list, abre directo el formulario de "Datos de
  // etiqueta" para el expediente recién cargado (reusa la misma llamada para
  // refrescar la grilla, evitando un segundo fetch).
  const abrirDatosEtiqueta = useCallback(
    async (targetId) => {
      const res = await cargar();
      const encontrada = (res?.detalles?.importaciones || []).find((i) => i.id === targetId);
      setArticulosEditor({ importacionId: targetId, expedienteName: encontrada?.name });
    },
    [cargar],
  );

  // Coinciden con la búsqueda (antes del filtro de estado, para contar por estado).
  const porBusqueda = useMemo(() => {
    const terminos = norm(busqueda).split(/\s+/).filter(Boolean);
    if (!terminos.length) return importaciones;
    return importaciones.filter((imp) => {
      const texto = norm([imp.name, imp.descripcion, imp.proveedor, imp.contenedor].join(' '));
      return terminos.every((t) => texto.includes(t));
    });
  }, [importaciones, busqueda]);

  const conteos = useMemo(() => {
    const c = { todos: porBusqueda.length };
    for (const imp of porBusqueda) c[imp.state] = (c[imp.state] || 0) + 1;
    return c;
  }, [porBusqueda]);

  const filtradas = useMemo(() => {
    const lista = estado === 'todos' ? [...porBusqueda] : porBusqueda.filter((i) => i.state === estado);
    if (orden === 'viejos') lista.sort((a, b) => a.id - b.id);
    else if (orden === 'rollos') lista.sort((a, b) => (b.rollosTotal || 0) - (a.rollosTotal || 0) || b.id - a.id);
    else lista.sort((a, b) => b.id - a.id);
    return lista;
  }, [porBusqueda, estado, orden]);

  // Cualquier cambio de filtro vuelve a la página 1.
  useEffect(() => {
    setPagina(1);
  }, [busqueda, estado, orden]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const desde = (paginaActual - 1) * POR_PAGINA;
  const visibles = filtradas.slice(desde, desde + POR_PAGINA);

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
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
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

      {/* Barra: buscador progresivo + orden + filtro por estado */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 sm:px-6 py-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por expediente, descripción, proveedor o contenedor…"
              className="w-full pl-9 pr-9 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              aria-label="Buscar expedientes"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value)}
            className="sm:w-44 py-2 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
            aria-label="Ordenar"
          >
            {ORDENES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <ChipEstado activo={estado === 'todos'} onClick={() => setEstado('todos')} label="Todos" n={conteos.todos} />
          {ESTADOS_EXP.filter((e) => conteos[e.id]).map((e) => (
            <ChipEstado
              key={e.id}
              activo={estado === e.id}
              onClick={() => setEstado(e.id)}
              label={e.label}
              n={conteos[e.id]}
            />
          ))}
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={cargar} />}

      {loading && importaciones.length === 0 ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : importaciones.length === 0 ? (
        <EmptyState title="Sin expedientes" description="Crea un expediente cargando un packing list." />
      ) : filtradas.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Sin resultados"
          description="Ningún expediente coincide con la búsqueda o el estado elegido."
          action={
            <button
              type="button"
              onClick={() => {
                setBusqueda('');
                setEstado('todos');
              }}
              className="text-sm font-semibold text-blue-700 hover:underline"
            >
              Limpiar filtros
            </button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibles.map((imp) => (
              <ExpedienteCard key={imp.id} imp={imp} />
            ))}
          </div>

          <Paginacion
            pagina={paginaActual}
            totalPaginas={totalPaginas}
            desde={desde + 1}
            hasta={desde + visibles.length}
            total={filtradas.length}
            onCambiar={(p) => {
              setPagina(p);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      )}

      <UploadContenedor
        open={uploadAbierto}
        onClose={() => setUploadAbierto(false)}
        operador={operador}
        onUploaded={cargar}
        onCompletarDatos={abrirDatosEtiqueta}
      />

      <ArticulosEditor
        open={!!articulosEditor}
        importacionId={articulosEditor?.importacionId}
        expedienteName={articulosEditor?.expedienteName}
        onClose={() => setArticulosEditor(null)}
        onSaved={cargar}
      />
    </div>
  );
}

function ChipEstado({ activo, onClick, label, n }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
        activo
          ? 'bg-blue-800 text-white border-blue-800'
          : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-800'
      }`}
    >
      {label}
      <span className={`tabular-nums ${activo ? 'text-blue-100' : 'text-slate-400'}`}>{n || 0}</span>
    </button>
  );
}

function Paginacion({ pagina, totalPaginas, desde, hasta, total, onCambiar }) {
  // Ventana de números: primera, última y 1 a cada lado de la actual.
  const numeros = [];
  for (let p = 1; p <= totalPaginas; p++) {
    if (p === 1 || p === totalPaginas || Math.abs(p - pagina) <= 1) numeros.push(p);
    else if (numeros[numeros.length - 1] !== '…') numeros.push('…');
  }
  const btn = 'min-w-[36px] h-9 px-2 text-sm font-semibold rounded-lg border transition-colors';
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
      <p className="text-sm text-slate-500">
        Mostrando <span className="font-semibold text-slate-700 tabular-nums">{desde}–{hasta}</span> de{' '}
        <span className="font-semibold text-slate-700 tabular-nums">{total}</span> expedientes
      </p>
      {totalPaginas > 1 && (
        <nav className="flex items-center gap-1" aria-label="Paginación">
          <button
            type="button"
            onClick={() => onCambiar(pagina - 1)}
            disabled={pagina === 1}
            className={`${btn} bg-white border-slate-200 text-blue-800 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed`}
            aria-label="Página anterior"
          >
            <ChevronLeft className="w-4 h-4 mx-auto" aria-hidden="true" />
          </button>
          {numeros.map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} className="px-1 text-slate-400">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onCambiar(p)}
                aria-current={p === pagina ? 'page' : undefined}
                className={`${btn} ${
                  p === pagina
                    ? 'bg-blue-800 border-blue-800 text-white'
                    : 'bg-white border-slate-200 text-blue-800 hover:bg-slate-50'
                }`}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => onCambiar(pagina + 1)}
            disabled={pagina === totalPaginas}
            className={`${btn} bg-white border-slate-200 text-blue-800 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed`}
            aria-label="Página siguiente"
          >
            <ChevronRight className="w-4 h-4 mx-auto" aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}

function ExpedienteCard({ imp }) {
  const total = imp.rollosTotal || 0;
  const est = ESTADO_POR_ID[imp.state];
  const segmentos = [
    { valor: imp.rollosRecibidos, color: 'bg-green-600' },
    { valor: imp.rollosTransito, color: 'bg-amber-500' },
    { valor: imp.rollosBodega, color: 'bg-blue-800' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-semibold text-blue-900 truncate">{imp.name}</p>
          <p className="text-sm text-slate-600 truncate" title={imp.descripcion}>
            {imp.descripcion || '—'}
          </p>
        </div>
        {est && (
          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md border ${est.cls}`}>
            {est.label}
          </span>
        )}
      </div>

      {(imp.proveedor || imp.contenedor) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {imp.proveedor && (
            <span className="inline-flex items-center gap-1 min-w-0">
              <Building2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{imp.proveedor}</span>
            </span>
          )}
          {imp.contenedor && (
            <span className="inline-flex items-center gap-1 font-mono">
              <Container className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              {imp.contenedor}
            </span>
          )}
        </div>
      )}

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

      <div className="mt-auto flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          Total: <span className="font-semibold text-slate-600 tabular-nums">{total}</span> rollos
        </p>
        {total > 0 && (
          <Link
            href={`/contenedores/${imp.id}`}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-blue-800 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-colors"
          >
            <FolderCog className="w-4 h-4" aria-hidden="true" />
            Administrar
          </Link>
        )}
      </div>
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
