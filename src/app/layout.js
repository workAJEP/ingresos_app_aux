import { Inter } from 'next/font/google';
import './globals.css';
import OdooStatusBanner from '@/components/OdooStatusBanner';
import MobileNav from '@/components/MobileNav';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
});

export const metadata = {
  title: 'Ingreso de Contenedores',
  description: 'Trazabilidad de rollos entre Bodega Z14, Piloto y Xena Coj',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1e3a8a',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="bg-slate-50 text-blue-900 min-h-[100dvh] antialiased">
        <OdooStatusBanner />
        {children}
        <MobileNav />
      </body>
    </html>
  );
}
