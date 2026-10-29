'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase/client';
import { markPasswordReset } from '@/lib/password-reset-flag';
import { isUnknownUserError, magicLinkOptions } from '@/lib/magic-link';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [tab, setTab] = useState<'password' | 'magic' | 'forgot'>('password');
  const [sentKind, setSentKind] = useState<'magic' | 'reset'>('magic');
  const router = useRouter();
  const supabase = createClient();

  // El callback manda aquí cuando el enlace venció, ya se usó o se abrió en otro navegador.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error') === 'auth_callback_failed') {
      setError('El enlace venció, ya se usó o lo abriste en otro navegador distinto al que lo pidió. Pide uno nuevo.');
    }
  }, []);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('Credenciales inválidas. Verifica tu email y contraseña.');
    } else {
      router.push('/dashboard');
      router.refresh();
    }
    setLoading(false);
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Solo entra quien ya tiene cuenta: no se crean cuentas desde aquí. Un correo sin cuenta se trata igual que un envío normal (no se revela cuáles existen).
    const { error } = await supabase.auth.signInWithOtp({ email, options: magicLinkOptions(window.location.origin) });
    if (error && !isUnknownUserError(error)) {
      setError(/rate limit|too many/i.test(error.message) ? 'Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.' : 'No se pudo enviar el enlace. Verifica el email.');
    } else {
      setSentKind('magic');
      setMagicLinkSent(true);
    }
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // La marca le avisa al callback que la visita que viene es una recuperación (ver lib/password-reset-flag.ts).
    markPasswordReset();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback` });
    if (error) {
      setError(/rate limit|too many/i.test(error.message) ? 'Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.' : 'No se pudo enviar el enlace. Inténtalo de nuevo en unos minutos.');
    } else {
      setSentKind('reset');
      setMagicLinkSent(true);
    }
    setLoading(false);
  };

  if (magicLinkSent) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-8 w-full max-w-md text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#0F172A] mb-2">Revisa tu correo</h2>
          <p className="text-[#64748B] text-sm">
            {sentKind === 'reset'
              ? <>Si <strong>{email}</strong> está registrado, te enviamos un enlace para crear una nueva contraseña. Ábrelo en este mismo navegador; vale por una hora.</>
              : <>Si <strong>{email}</strong> tiene una cuenta, le enviamos un enlace de acceso. Úsalo para ingresar al sistema (ábrelo en este mismo navegador).</>}
          </p>
          <button
            onClick={() => { setMagicLinkSent(false); setTab('password'); }}
            className="mt-6 text-sm text-[#2563EB] hover:underline"
          >
            {sentKind === 'reset' ? 'Volver a iniciar sesión' : 'Usar otro método'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 bg-[#0F2D4A] rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-[#0F2D4A]">AuditMind</span>
          </div>
          <p className="text-[#64748B] text-sm">Plataforma de Auditoría Inteligente</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-8">
          <h1 className="text-xl font-semibold text-[#0F172A] mb-6">{tab === 'forgot' ? 'Recuperar contraseña' : 'Iniciar sesión'}</h1>

          {/* Tabs */}
          <div className="flex gap-1 bg-[#F8FAFC] rounded-lg p-1 mb-6">
            <button
              onClick={() => setTab('password')}
              className={`flex-1 py-2 text-sm rounded-md font-medium transition-colors ${
                tab === 'password'
                  ? 'bg-white text-[#0F172A] shadow-sm'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Contraseña
            </button>
            <button
              onClick={() => setTab('magic')}
              className={`flex-1 py-2 text-sm rounded-md font-medium transition-colors ${
                tab === 'magic'
                  ? 'bg-white text-[#0F172A] shadow-sm'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Enlace mágico
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {tab === 'password' ? (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                  required
                  className="w-full px-3.5 py-2.5 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3.5 py-2.5 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-shadow"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0F2D4A] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1A4A7A] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Ingresando...
                  </>
                ) : 'Ingresar'}
              </button>
              <div className="text-center">
                <button type="button" onClick={() => { setError(null); setTab('forgot'); }} className="text-sm text-[#2563EB] hover:underline">
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            </form>
          ) : tab === 'forgot' ? (
            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                  required
                  className="w-full px-3.5 py-2.5 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                />
              </div>
              <p className="text-xs text-[#64748B]">
                Te enviaremos un enlace para crear una nueva contraseña. Ábrelo en este mismo navegador.
              </p>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0F2D4A] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1A4A7A] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Enviando...' : 'Enviar enlace para crear contraseña'}
              </button>
              <div className="text-center">
                <button type="button" onClick={() => { setError(null); setTab('password'); }} className="text-sm text-[#2563EB] hover:underline">
                  Volver a iniciar sesión
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                  required
                  className="w-full px-3.5 py-2.5 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-shadow"
                />
              </div>
              <p className="text-xs text-[#64748B]">
                Te enviaremos un enlace seguro de un solo uso a tu correo registrado.
              </p>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0F2D4A] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1A4A7A] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? 'Enviando...' : 'Enviar enlace de acceso'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-[#94A3B8] mt-6">
          AuditMind © 2026 · Todos los derechos reservados
        </p>
      </div>
    </div>
  );
}
