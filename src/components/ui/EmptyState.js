import { Inbox } from 'lucide-react';

export default function EmptyState({ icon: Icon = Inbox, title = 'Sin datos', description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-4 ${className}`}>
      <span className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 text-slate-400 mb-3">
        <Icon className="w-6 h-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-blue-900">{title}</p>
      {description && <p className="text-sm text-slate-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
