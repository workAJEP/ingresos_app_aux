'use client';

import { useRef, useState } from 'react';
import { X, UploadCloud, FileSpreadsheet, ChevronDown, ChevronUp, PlusCircle } from 'lucide-react';
import { apiFetch } from './useApi';
import ImportacionPicker from './ImportacionPicker';
import Spinner from './ui/Spinner';

const ACCEPT = '.xlsx,.xls,.csv';

/**
 * Modal de carga de contenedor: liga a expediente existente (ImportacionPicker)
 * o crea uno nuevo (POST /api/odoo/importaciones), luego sube el packing list
 * por drag&drop o selector (POST multipart /api/odoo/rollos/upload).
 * Resultado expandible (creados / yaExistentes / etc.).
 */
export default function UploadContenedor({ open, onClose, operador, onUploaded }) {
  const [modo, setModo] = useState('existente'); // 'existente' | 'nuevo'
  const [importacionId, setImportacionId] = useState(null);
  const [descripcion, setDescripcion] = useState('');
  const [proveedorNombre, setProveedorNombre] = useState('');
  const [contenedor, setContenedor] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [expandido, setExpandido] = useState(false);
  const inputRef = useRef(null);

  if (!open) return null;

  const resetear = () => {
    setModo('existente');
    setImportacionId(null);
    setDescripcion('');
    setProveedorNombre('');
    setContenedor('');
    setArchivo(null);
    setResultado(null);
    setError('');
    setExpandido(false);
  };

  const cerrar = () => {
    resetear();
    onClose?.();
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setArchivo(file);
  };

  const subir = async () => {
    setError('');
    if (!archivo) {
      setError('Selecciona un archivo.');
      return;
    }

    let targetId = importacionId;
    setSubiendo(true);

    try {
      if (modo === 'nuevo') {
        if (!descripcion.trim()) {
          setError('Ingresa una descripción para el nuevo expediente.');
          setSubiendo(false);
          return;
        }
        const resImp = await apiFetch('/api/odoo/importaciones', {
          method: 'POST',
          body: { descripcion, proveedorNombre, contenedor },
        });
        if (resImp.status === 'error') {
          setError(resImp.msg);
          setSubiendo(false);
          return;
        }
        targetId = resImp.detalles?.id;
      }

      if (!targetId) {
        setError('Selecciona un expediente destino.');
        setSubiendo(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', archivo);
      formData.append('importacionId', targetId);
      formData.append('operador', operador || '');

      const res = await apiFetch('/api/odoo/rollos/upload', { method: 'POST', body: formData });
      if (res.status === 'error') {
        setError(res.msg);
      } else {
        setResultado(res.detalles);
        onUploaded?.(res.detalles);
      }
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div role="dialog" aria-modal="true" className="bg-white rounded-xl border border-slate-200 p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-blue-900">Cargar contenedor</h3>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="p-1.5 rounded text-blue-700 hover:bg-blue-50 transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {!resultado ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModo('existente')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  modo === 'existente' ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-blue-700 border-slate-200'
                }`}
              >
                Expediente existente
              </button>
              <button
                type="button"
                onClick={() => setModo('nuevo')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  modo === 'nuevo' ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-blue-700 border-slate-200'
                }`}
              >
                Nuevo expediente
              </button>
            </div>

            {modo === 'existente' ? (
              <div>
                <label className="block text-xs font-semibold text-blue-700 mb-1">Expediente</label>
                <ImportacionPicker value={importacionId} onChange={setImportacionId} allowAll={false} className="w-full" />
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-blue-700 mb-1">Descripción</label>
                  <input
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    placeholder="Descripción del expediente"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-blue-700 mb-1">Proveedor</label>
                  <input
                    value={proveedorNombre}
                    onChange={(e) => setProveedorNombre(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    placeholder="Nombre del proveedor"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-blue-700 mb-1">Contenedor</label>
                  <input
                    value={contenedor}
                    onChange={(e) => setContenedor(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    placeholder="Número de contenedor"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">Archivo (packing list)</label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg px-4 py-8 text-center cursor-pointer transition-colors ${
                  dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
                }`}
              >
                {archivo ? (
                  <>
                    <FileSpreadsheet className="w-6 h-6 text-blue-700" aria-hidden="true" />
                    <p className="text-sm font-semibold text-blue-900">{archivo.name}</p>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-6 h-6 text-blue-700" aria-hidden="true" />
                    <p className="text-sm text-slate-500">
                      Arrastra el archivo aquí o haz clic para seleccionar (.xlsx, .xls, .csv)
                    </p>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={cerrar}
                className="px-4 py-2 text-sm text-blue-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={subir}
                disabled={subiendo}
                className="px-4 py-2 text-sm text-white bg-blue-800 hover:bg-blue-900 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {subiendo && <Spinner size="sm" className="text-white" />}
                Cargar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Resumen label="Filas en archivo" valor={resultado.totalFilas} />
              <Resumen label="Creados" valor={resultado.creados} />
              <Resumen label="Ya existentes" valor={resultado.yaExistentes?.length ?? 0} />
              <Resumen label="Duplicadas en archivo" valor={resultado.duplicadasEnArchivo} />
            </div>
            {resultado.descartadasSinBarcode != null && (
              <p className="text-xs text-slate-500">Descartadas sin código: {resultado.descartadasSinBarcode}</p>
            )}
            {resultado.yaExistentes?.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setExpandido((v) => !v)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-blue-700"
                >
                  {expandido ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
                  Ver códigos ya existentes ({resultado.yaExistentes.length})
                </button>
                {expandido && (
                  <ul className="mt-2 max-h-40 overflow-y-auto text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-0.5">
                    {resultado.yaExistentes.map((codigo) => (
                      <li key={codigo}>{codigo}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => setResultado(null)}
                className="px-4 py-2 text-sm text-blue-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" aria-hidden="true" /> Cargar otro
              </button>
              <button
                type="button"
                onClick={cerrar}
                className="px-4 py-2 text-sm text-white bg-blue-800 hover:bg-blue-900 rounded-xl transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Resumen({ label, valor }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
      <p className="text-[11px] font-semibold uppercase text-blue-700">{label}</p>
      <p className="text-lg font-bold text-blue-900 tabular-nums">{valor ?? '—'}</p>
    </div>
  );
}
