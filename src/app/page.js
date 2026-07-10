'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackagePlus, Truck, Warehouse, LayoutDashboard, Boxes, FileText, LogOut } from 'lucide-react';
import { apiFetch } from '@/components/useApi';
import { useOperador } from '@/components/OperadorGate';

const TARJETAS = [
  { href: '/scan?fase=ingreso', icon: PackagePlus, titulo: 'Ingreso Z14', descripcion: 'Registrar llegada a bodega', accent: 'blue' },
  { href: '/scan?fase=piloto', icon: Truck, titulo: 'Piloto', descripcion: 'Carga hacia Xena Coj', accent: 'amber' },
  { href: '/scan?fase=xena', icon: Warehouse, titulo: 'Recepción Xena', descripcion: 'Descarga en bodega Xena', accent: 'green' },
  { href: '/dashboard', icon: LayoutDashboard, titulo: 'Dashboard', descripcion: 'Inventario en vivo', accent: 'blue' },
  { href: '/contenedores', icon: Boxes, titulo: 'Contenedores', descripcion: 'Expedientes y carga de packing list', accent: 'blue' },
  { href: '/manifiesto', icon: FileText, titulo: 'Manifiesto', descripcion: 'Manifiesto de carga diario', accent: 'blue' },
];

const ACCENTS = {
  blue: 'text-blue-700',
  amber: 'text-amber-600',
  green: 'text-green-700',
};

export default function HomePage() {
  const router = useRouter();
  const { operador } = useOperador();
  const [salud, setSalud] = useState(null); // null=verificando, true=ok, false=caído

  async function cerrarSesion() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // aunque falle la red, la sesión se invalida al re-loguear
    }
    router.push('/login');
    router.refresh();
  }

  useEffect(() => {
    let activo = true;
    apiFetch('/api/health').then((res) => {
      if (activo) setSalud(res.status !== 'error');
    });
    return () => {
      activo = false;
    };
  }, []);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-white border border-slate-200 rounded-xl">
        <div>
          <h1 className="text-xl font-semibold text-blue-900 flex items-center gap-2">
            <Boxes className="w-[22px] h-[22px] text-blue-700" aria-hidden="true" />
            Ingreso de Contenedores
          </h1>
          <p className="text-sm text-black mt-0.5">Trazabilidad de rollos entre Bodega Z14, Piloto y Xena Coj</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            <span
              className={`w-2.5 h-2.5 rounded-full ${salud === null ? 'bg-slate-300' : salud ? 'bg-green-500' : 'bg-red-500'}`}
              aria-hidden="true"
            />
            <span className="text-slate-500">
              {salud === null ? 'Verificando…' : salud ? 'Odoo conectado' : 'Odoo sin conexión'}
            </span>
          </div>
          {operador && (
            <span className="text-sm font-semibold text-blue-900 bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
              {operador}
            </span>
          )}
          <button
            type="button"
            onClick={cerrarSesion}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-800 bg-white border border-slate-200 rounded-full px-3 py-1.5 hover:bg-slate-50 transition-colors"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TARJETAS.map(({ href, icon: Icon, titulo, descripcion, accent }) => (
          <Link
            key={href}
            href={href}
            className="group bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3 hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <span className={`inline-flex w-10 h-10 items-center justify-center rounded-lg bg-blue-50 ${ACCENTS[accent] || ACCENTS.blue}`}>
              <Icon className="w-5 h-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-base font-semibold text-blue-900">{titulo}</p>
              <p className="text-sm text-slate-500 mt-0.5">{descripcion}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
