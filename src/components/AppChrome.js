'use client';

import { usePathname } from 'next/navigation';
import OdooStatusBanner from '@/components/OdooStatusBanner';
import MobileNav from '@/components/MobileNav';

/**
 * Envuelve el "chrome" global de la app (banner de estado de Odoo + navegación
 * inferior móvil). Se OCULTA en /login para que la pantalla de acceso se vea
 * limpia (sin barra ni banner). El resto de rutas lo muestran normalmente.
 */
export default function AppChrome({ children }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  return (
    <>
      {!isLogin && <OdooStatusBanner />}
      {children}
      {!isLogin && <MobileNav />}
    </>
  );
}
