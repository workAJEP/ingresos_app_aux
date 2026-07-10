'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Colores congelados por el plan §4
const COLORES = {
  bodega: '#1e40af',
  transito: '#b45309',
  recibido: '#15803d',
  pendiente: '#94a3b8',
};

const ETIQUETAS = {
  bodega: 'En bodega',
  transito: 'En tránsito',
  recibido: 'Recibido',
  pendiente: 'Pendiente',
};

export default function DonutEstados({ data }) {
  const entradas = Object.entries(data || {})
    .filter(([, valor]) => valor > 0)
    .map(([estado, valor]) => ({ estado, valor }));

  if (entradas.length === 0) {
    return (
      <div className="flex items-center justify-center h-[220px] text-sm text-slate-400">
        Sin datos para graficar.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={entradas} dataKey="valor" nameKey="estado" innerRadius={55} outerRadius={80} paddingAngle={2}>
          {entradas.map((entry) => (
            <Cell key={entry.estado} fill={COLORES[entry.estado] || '#94a3b8'} />
          ))}
        </Pie>
        <Tooltip formatter={(valor, nombre) => [valor, ETIQUETAS[nombre] || nombre]} />
        <Legend formatter={(valor) => ETIQUETAS[valor] || valor} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
