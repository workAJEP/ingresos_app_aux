import { AlertTriangle, X } from 'lucide-react';

export default function ErrorBanner({ message, onDismiss, onRetry, retryLabel = 'Reintentar', className = '' }) {
  if (!message) return null;
  return (
    <div className={`flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm ${className}`}>
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <p className="flex-1">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline shrink-0">
          {retryLabel}
        </button>
      )}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Cerrar" className="shrink-0">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
