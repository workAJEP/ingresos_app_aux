'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Home, PackagePlus, Truck, Warehouse, LayoutDashboard } from 'lucide-react';

const ITEMS = [
  { href: '/', match: (p) => p === '/', icon: Home, label: 'Inicio' },
  {
    href: '/scan?fase=ingreso',
    match: (p, fase) => p === '/scan' && fase === 'ingreso',
    icon: PackagePlus,
    label: 'Ingreso',
  },
  {
    href: '/scan?fase=piloto',
    match: (p, fase) => p === '/scan' && fase === 'piloto',
    icon: Truck,
    label: 'Piloto',
  },
  {
    href: '/scan?fase=xena',
    match: (p, fase) => p === '/scan' && fase === 'xena',
    icon: Warehouse,
    label: 'Xena',
  },
  { href: '/dashboard', match: (p) => p === '/dashboard', icon: LayoutDashboard, label: 'Panel' },
];

function MobileNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fase = searchParams.get('fase');

  return (
    <nav className="no-print md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
      <ul className="flex items-stretch">
        {ITEMS.map(({ href, match, icon: Icon, label }) => {
          const active = match(pathname, fase);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[56px] transition-colors ${
                  active ? 'text-blue-800 bg-blue-50' : 'text-slate-500'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="text-[11px] font-semibold leading-none">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Barra de navegación inferior fija, solo móvil. Envuelta en Suspense por useSearchParams. */
export default function MobileNav() {
  return (
    <Suspense fallback={null}>
      <MobileNavInner />
    </Suspense>
  );
}
