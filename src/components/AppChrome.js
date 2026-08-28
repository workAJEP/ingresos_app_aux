'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import OdooStatusBanner from '@/components/OdooStatusBanner';
import MobileNav from '@/components/MobileNav';
import Sidebar from '@/components/Sidebar';

/**
 * Envuelve el "chrome" global de la app: banner de estado de Odoo, menú
 * lateral retraíble (desktop) y navegación inferior (móvil). Se OCULTA en
 * /login para que la pantalla de acceso se vea limpia.
 */
export default function AppChrome({ children }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';
  // Colapso del menú lateral, recordado por navegador.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('ic-sidebar-collapsed') === '1');
    } catch {
      /* sin storage (privado/bloqueado): queda expandido */
    }
  }, []);

  const toggle = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem('ic-sidebar-collapsed', v ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  if (isLogin) return children;

  return (
    <>
      <OdooStatusBanner />
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      {/* El contenido se corre a la derecha del sidebar solo en md+ (en móvil
          el sidebar no existe y manda la barra inferior). */}
      <div className={`transition-[padding] duration-200 ${collapsed ? 'md:pl-16' : 'md:pl-60'}`}>{children}</div>
      <MobileNav />
    </>
  );
}
