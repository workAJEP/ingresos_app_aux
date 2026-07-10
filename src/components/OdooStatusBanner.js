'use client';

import { useCallback, useEffect, useState } from 'react';
import { WifiOff, RotateCw } from 'lucide-react';
import { apiFetch } from './useApi';

/**
 * Banner rojo global de estado de Odoo. Escucha los eventos window
 * 'odoo-offline' / 'odoo-online' disparados por apiFetch en cada request
 * (503 -> offline, cualquier otra respuesta -> online). Botón Reintentar
 * llama a GET /api/health.
 */
export default function OdooStatusBanner() {
  const [offline, setOffline] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener('odoo-offline', onOffline);
    window.addEventListener('odoo-online', onOnline);
    return () => {
      window.removeEventListener('odoo-offline', onOffline);
      window.removeEventListener('odoo-online', onOnline);
    };
  }, []);

  const reintentar = useCallback(async () => {
    setRetrying(true);
    const res = await apiFetch('/api/health');
    setRetrying(false);
    if (res.status !== 'error') setOffline(false);
  }, []);

  if (!offline) return null;

  return (
    <div className="no-print sticky top-0 z-[300] bg-red-600 text-white px-4 py-2 flex flex-wrap items-center justify-center gap-3 text-sm font-semibold shadow-md">
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>Sin conexión con Odoo — los escaneos no se están guardando.</span>
      <button
        type="button"
        onClick={reintentar}
        disabled={retrying}
        className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 px-3 py-1 rounded-md transition-colors disabled:opacity-60"
      >
        <RotateCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />
        Reintentar
      </button>
    </div>
  );
}
