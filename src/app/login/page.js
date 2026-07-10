'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Boxes, LogIn, Loader2, Eye, EyeOff } from 'lucide-react';
import ErrorBanner from '@/components/ui/ErrorBanner';

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || 'No se pudo iniciar sesión');
      const next = new URLSearchParams(window.location.search).get('next') || '/';
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-4 bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-6">
          <span className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-blue-800 text-white">
            <Boxes className="w-8 h-8" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold text-blue-900">Ingreso de Contenedores</h1>
          <p className="text-sm text-blue-700">Inicia sesión con tu usuario de Odoo</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <ErrorBanner message={error} onDismiss={() => setError('')} />

          <div>
            <label className="block text-xs font-semibold text-blue-700 mb-1">Usuario</label>
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              placeholder="usuario o correo"
              className="w-full px-3 py-3 min-h-[52px] text-base border border-slate-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-blue-700 mb-1">Contraseña</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-3 py-3 pr-11 min-h-[52px] text-base border border-slate-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? 'Ocultar' : 'Mostrar'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-700"
              >
                {showPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !login || !password}
            className="w-full inline-flex items-center justify-center gap-2 min-h-[52px] bg-blue-800 hover:bg-blue-900 text-white text-base font-semibold px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}
