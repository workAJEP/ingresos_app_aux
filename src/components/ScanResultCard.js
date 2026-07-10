'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react';

const ICONS = { success: CheckCircle2, warning: AlertTriangle, info: Info, error: XCircle };
const ESTILOS = {
  success: 'bg-green-100 text-green-700 border-green-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  error: 'bg-red-50 text-red-700 border-red-200',
};

/**
 * Tarjeta de resultado de escaneo. Muestra mensaje + detalles del rollo y,
 * según fase, progresos (ingreso), rendimiento diario (piloto) o inventario
 * (xena). Flash breve (300ms) en cada nuevo resultado.
 */
export default function ScanResultCard({ resultado, fase }) {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!resultado) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 300);
    return () => clearTimeout(t);
  }, [resultado]);

  if (!resultado) return null;

  const { status, msg, detalles } = resultado;
  const Icon = ICONS[status] || Info;
  const estilo = ESTILOS[status] || ESTILOS.info;
  const flashClass = status === 'success' ? 'ic-flash-ok' : status === 'error' ? 'ic-flash-err' : '';
  const loteCompleto =
    fase === 'ingreso' &&
    detalles?.ingresadosArticulo != null &&
    detalles.totalArticulo != null &&
    detalles.ingresadosArticulo === detalles.totalArticulo;

  return (
    <div
      id="ic-scan-result"
      className={`rounded-xl border p-4 space-y-3 transition-transform duration-300 ${estilo} ${
        flash ? `scale-[1.02] ${flashClass}` : 'scale-100'
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon className="w-7 h-7 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-base font-semibold leading-snug">{msg}</p>
      </div>

      {detalles?.codigo && (
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-0.5 pr-3 font-semibold text-blue-700 w-1/3">Código</td>
              <td className="py-0.5 font-mono tabular-nums">{detalles.codigo}</td>
            </tr>
            {detalles.pieza != null && detalles.pieza !== '' && (
              <tr>
                <td className="py-0.5 pr-3 font-semibold text-blue-700">Pieza</td>
                <td className="py-0.5">{detalles.pieza}</td>
              </tr>
            )}
            {detalles.codigoDist != null && detalles.codigoDist !== '' && (
              <tr>
                <td className="py-0.5 pr-3 font-semibold text-blue-700">Código Dist.</td>
                <td className="py-0.5">{detalles.codigoDist}</td>
              </tr>
            )}
            {(detalles.metros != null || detalles.yardas != null) && (
              <tr>
                <td className="py-0.5 pr-3 font-semibold text-blue-700">Medida</td>
                <td className="py-0.5 font-mono tabular-nums">
                  {detalles.metros} Mts / {detalles.yardas} Yds
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {fase === 'ingreso' && detalles?.globalIngresados != null && (
        <div className="space-y-2">
          <ProgresoBarra label="Contenedor global" actual={detalles.globalIngresados} total={detalles.globalTotal} />
          <ProgresoBarra
            label={`Artículo ${detalles.codigoDist ?? ''}`}
            actual={detalles.ingresadosArticulo}
            total={detalles.totalArticulo}
          />
          {loteCompleto && (
            <p className="text-xs font-semibold text-green-700 bg-green-100 border border-green-200 rounded-md px-2 py-1 text-center">
              ¡Lote completado!
            </p>
          )}
        </div>
      )}

      {fase === 'piloto' && detalles?.cargadosHoy != null && (
        <p className="text-xs font-semibold text-amber-700">
          Rendimiento diario: <span className="tabular-nums">{detalles.cargadosHoy}</span> rollos cargados hoy.
        </p>
      )}

      {fase === 'xena' && detalles?.recibidosHoy != null && (
        <p className="text-xs font-semibold text-green-700">
          Descargados hoy: <span className="tabular-nums">{detalles.recibidosHoy}</span> · Inventario total:{' '}
          <span className="tabular-nums">{detalles.totalRecibidos}</span>
        </p>
      )}
    </div>
  );
}

function ProgresoBarra({ label, actual, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((actual / total) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs font-semibold text-blue-700 mb-1">
        <span>{label}</span>
        <span className="tabular-nums">
          {actual} de {total}
        </span>
      </div>
      <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
        <div
          className="h-full bg-blue-800 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
