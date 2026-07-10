const ACCENTS = {
  blue: 'text-blue-700',
  amber: 'text-amber-700',
  green: 'text-green-700',
  slate: 'text-slate-500',
};

export default function StatCard({ icon: Icon, label, value, accent = 'blue' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
      {Icon && (
        <span className={`shrink-0 ${ACCENTS[accent] || ACCENTS.blue}`}>
          <Icon className="w-6 h-6" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 truncate">{label}</p>
        <p className="text-2xl font-bold text-blue-900 tabular-nums">{value}</p>
      </div>
    </div>
  );
}
