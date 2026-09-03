'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

/**
 * Reemplaza el antiguo route.ts (servidor, solo sabía leer `?code=` — flujo
 * PKCE). Los links de invitación/recuperación generados por el admin (Supabase
 * Admin API, sin verificador PKCE del navegador) devuelven el token en el
 * FRAGMENTO de la URL (`#access_token=...&type=invite`), que nunca llega al
 * servidor — solo un componente cliente puede leerlo. Este componente cubre
 * AMBOS casos: `?code=` (magic link autoiniciado desde /login, ya funcionaba)
 * y `#access_token=` (invitación/recuperación generadas por un admin).
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const params = new URLSearchParams(window.location.search);
    const next = params.get('next') ?? '/dashboard';
    const code = params.get('code');

    // Leer el tipo ANTES de que el SDK procese y limpie el fragmento.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hashType = hashParams.get('type');
    const isFirstTimeSetup = hashType === 'invite' || hashType === 'recovery';

    let timeout: ReturnType<typeof setTimeout> | undefined;

    const finish = (session: unknown) => {
      if (timeout) clearTimeout(timeout);
      if (!session) {
        setError(true);
        return;
      }
      router.replace(isFirstTimeSetup ? '/auth/set-password' : next);
    };

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error: exchangeError }) => {
        if (exchangeError) {
          setError(true);
        } else {
          finish(data.session);
        }
      });
      return;
    }

    if (window.location.hash.includes('access_token')) {
      // `detectSessionInUrl` (activo por defecto) procesa el fragmento en
      // segundo plano — esperamos el evento en vez de adivinar el timing.
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
          sub.subscription.unsubscribe();
          finish(session);
        }
      });
      // Por si la sesión ya estaba lista antes de suscribirnos.
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          sub.subscription.unsubscribe();
          finish(data.session);
        }
      });
      timeout = setTimeout(() => {
        sub.subscription.unsubscribe();
        setError(true);
      }, 8000);
      return () => {
        if (timeout) clearTimeout(timeout);
        sub.subscription.unsubscribe();
      };
    }

    setError(true);
  }, [router, supabase]);

  useEffect(() => {
    if (error) {
      router.replace('/login?error=auth_callback_failed');
    }
  }, [error, router]);

  if (error) return null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="text-center">
        <svg className="animate-spin w-8 h-8 text-[#0F2D4A] mx-auto mb-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-[#64748B] text-sm">Verificando acceso…</p>
      </div>
    </div>
  );
}
