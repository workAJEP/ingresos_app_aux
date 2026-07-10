// Mapa centralizado de estados del rollo: pendiente | bodega | transito | recibido
export const ESTADOS = {
  pendiente: {
    label: 'Pendiente',
    className: 'bg-white text-blue-700 border-blue-200',
  },
  bodega: {
    label: 'En bodega',
    className: 'bg-blue-800 text-white border-blue-800',
  },
  transito: {
    label: 'En tránsito',
    className: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  recibido: {
    label: 'Recibido',
    className: 'bg-green-100 text-green-700 border-green-200',
  },
};

export default function Badge({ estado, children, className = '' }) {
  const cfg = ESTADOS[estado];
  const label = children ?? cfg?.label ?? estado ?? '—';
  const cls = cfg?.className ?? 'bg-white text-blue-700 border-blue-200';
  return (
    <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-md border ${cls} ${className}`}>
      {label}
    </span>
  );
}
