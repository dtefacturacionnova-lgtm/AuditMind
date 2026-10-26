'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';


/** Traduce el error de supabase.auth.updateUser a un mensaje que el usuario pueda accionar. */
function describePasswordError(err: { message?: string; code?: string; status?: number; reasons?: string[] }): string {
  const code = err.code ?? '';
  const raw = err.message ?? '';
  const reasons: string[] = err.reasons ?? [];

  if (code === 'weak_password' || reasons.length > 0) {
    const parts: string[] = [];
    if (reasons.includes('length')) parts.push('es demasiado corta');
    if (reasons.includes('characters')) parts.push('debe combinar minúsculas, mayúsculas, números y un símbolo (ej. ! @ # $ %)');
    if (reasons.includes('pwned')) parts.push('aparece en filtraciones de contraseñas conocidas — elige otra distinta');
    return parts.length
      ? `La contraseña no cumple la política de seguridad: ${parts.join('; ')}.`
      : `La contraseña no cumple la política de seguridad. ${raw}`;
  }
  if (code === 'same_password') return 'La nueva contraseña debe ser distinta de la actual.';
  if (code === 'reauthentication_needed' || /reauthenticat/i.test(raw)) {
    return 'Por seguridad necesitas haber iniciado sesión hace poco. Cierra sesión, entra de nuevo con "Enlace mágico" y vuelve a esta pantalla.';
  }
  if (['session_not_found', 'session_expired', 'bad_jwt', 'no_authorization'].includes(code) || err.status === 401) {
    return 'Tu sesión venció. Entra de nuevo con "Enlace mágico" y vuelve a intentarlo.';
  }
  if (code === 'over_request_rate_limit' || err.status === 429) {
    return 'Demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.';
  }
  if (/failed to fetch|network/i.test(raw)) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  }
  // Cualquier otro caso: mostrar el motivo real en vez de ocultarlo.
  return `No se pudo guardar la contraseña: ${raw || 'error desconocido'}${code ? ` (${code})` : ''}.`;
}

export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/login');
      } else {
        setCheckingSession(false);
      }
    });
  }, [router, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      console.error('[set-password] updateUser falló:', updateError);
      setError(describePasswordError(updateError as { message?: string; code?: string; status?: number; reasons?: string[] }));
      return;
    }

    router.push('/dashboard');
    router.refresh();
  };

  if (checkingSession) return null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
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
          <h1 className="text-xl font-semibold text-[#0F172A] mb-1">Crea tu contraseña</h1>
          <p className="text-[#64748B] text-sm mb-6">
            Define tu contraseña para las próximas veces.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Nueva contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                minLength={8}
                className="w-full px-3.5 py-2.5 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-shadow"
              />
            </div>
            <p className="text-xs text-[#64748B] -mt-2">
              Usa al menos 10 caracteres combinando mayúsculas, minúsculas, números y un símbolo.
            </p>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Confirmar contraseña
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repite la contraseña"
                required
                minLength={8}
                className="w-full px-3.5 py-2.5 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-shadow"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0F2D4A] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1A4A7A] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? 'Guardando...' : 'Guardar y continuar'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[#94A3B8] mt-6">
          AuditMind © 2026 · Todos los derechos reservados
        </p>
      </div>
    </div>
  );
}
