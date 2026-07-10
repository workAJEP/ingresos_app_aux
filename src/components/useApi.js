'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Helper de fetch compartido. Hace fetch, parsea JSON, dispara eventos
 * window 'odoo-offline' / 'odoo-online' y devuelve el dict {status,msg,detalles}
 * usado en todo el contrato de API (§3 del plan).
 *
 * - options.body puede ser un objeto plano (se serializa a JSON) o un FormData
 *   (se envía tal cual, sin forzar Content-Type, para multipart/upload).
 */
export async function apiFetch(path, options = {}) {
  const opts = { ...options };
  const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;

  if (isFormData) {
    opts.headers = { ...(opts.headers || {}) };
  } else {
    opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
    }
  }

  try {
    const res = await fetch(path, opts);

    if (typeof window !== 'undefined') {
      if (res.status === 503) {
        window.dispatchEvent(new Event('odoo-offline'));
      } else {
        window.dispatchEvent(new Event('odoo-online'));
      }
    }

    let body = null;
    try {
      body = await res.json();
    } catch {
      // Respuesta no-JSON (p.ej. streams de descarga); no es el camino normal de apiFetch.
    }

    if (!body) {
      if (!res.ok) {
        return { status: 'error', msg: `Error ${res.status}`, detalles: null };
      }
      return { status: 'success', msg: '', detalles: null };
    }

    return body;
  } catch (err) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('odoo-offline'));
    }
    return { status: 'error', msg: 'No se pudo conectar con el servidor.', detalles: null };
  }
}

/** Hook de conveniencia: expone apiFetch para componentes cliente. */
export default function useApi() {
  return { apiFetch };
}

/**
 * Hook de carga de datos GET con estado loading/error y refetch manual.
 * path=null/'' desactiva el fetch (útil mientras se resuelven dependencias).
 */
export function useFetchData(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (!path) return null;
    setLoading(true);
    setError('');
    const res = await apiFetch(path);
    if (res.status === 'error') setError(res.msg);
    setData(res);
    setLoading(false);
    return res;
  }, [path]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
