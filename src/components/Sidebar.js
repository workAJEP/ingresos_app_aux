'use client';

import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import {
  Home,
  PackagePlus,
  Boxes,
  FileText,
  LayoutDashboard,
  ClipboardList,
  Truck,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// Todas las opciones de la app (mismo criterio que MobileNav, más el
// manifiesto de envío). `match` decide el resaltado de la ruta activa.
const ITEMS = [
  { href: '/', match: (p) => p === '/', icon: Home, label: 'Inicio' },
  {
    href: '/scan?fase=ingreso',
    match: (p, fase) => p === '/scan' && (!fase || fase === 'ingreso'),
    icon: PackagePlus,
    label: 'Ingreso Z14',
  },
  { href: '/contenedores', match: (p) => p === '/contenedores', icon: Boxes, label: 'Contenedores' },
  { href: '/dashboard', match: (p) => p === '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/reporte', match: (p) => p === '/reporte', icon: ClipboardList, label: 'Reporte' },
  { href: '/manifiesto', match: (p) => p === '/manifiesto', icon: FileText, label: 'Manifiesto' },
  { href: '/manifiesto-envio', match: (p) => p === '/manifiesto-envio', icon: Truck, label: 'Manifiesto de envío' },
];

function SidebarInner({ collapsed, onToggle }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const fase = searchParams.get('fase');

  const cerrarSesion = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // aunque falle la red, la sesión se invalida al re-loguear
    }
    router.push('/login');
    router.refresh();
  };

  return (
    <aside
      className={`no-print hidden md:flex fixed inset-y-0 left-0 z-40 flex-col bg-white border-r border-slate-200 transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Icono + nombre de la app */}
      <div className={`flex items-center gap-2.5 px-3 h-16 border-b border-slate-100 ${collapsed ? 'justify-center' : ''}`}>
        <span className="shrink-0 inline-flex w-9 h-9 items-center justify-center rounded-lg bg-blue-800 text-white">
          <Boxes className="w-5 h-5" aria-hidden="true" />
        </span>
        {!collapsed && (
          <div className="leading-tight min-w-0">
            <p className="text-sm font-bold text-blue-900 truncate">Ingreso de Contenedores</p>
            <p className="text-[10px] text-slate-500 truncate">Z14 · Piloto · Xena Coj</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="space-y-1 px-2">
          {ITEMS.map(({ href, match, icon: Icon, label }) => {
            const active = match(pathname, fase);
            return (
              <li key={href}>
                <Link
                  href={href}
                  title={collapsed ? label : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-semibold transition-colors ${
                    collapsed ? 'justify-center' : ''
                  } ${active ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50 hover:text-blue-800'}`}
                >
                  <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-100 p-2 space-y-1">
        <button
          type="button"
          onClick={cerrarSesion}
          title={collapsed ? 'Cerrar sesión' : undefined}
          className={`w-full flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-red-700 transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <LogOut className="w-5 h-5 shrink-0" aria-hidden="true" />
          {!collapsed && 'Cerrar sesión'}
        </button>
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className={`w-full flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5 shrink-0" aria-hidden="true" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5 shrink-0" aria-hidden="true" />
              Colapsar
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

/** Menú lateral retraíble (solo md+; en móvil sigue MobileNav). Envuelto en
 *  Suspense por useSearchParams. */
export default function Sidebar({ collapsed, onToggle }) {
  return (
    <Suspense fallback={null}>
      <SidebarInner collapsed={collapsed} onToggle={onToggle} />
    </Suspense>
  );
}
