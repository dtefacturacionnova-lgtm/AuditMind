'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

/**
 * Reemplaza el antiguo route.ts (servidor, solo sabía leer `?code=` — flujo
 * PKCE). Los links de invitación/recuperación generados por el admin (Supabase
 * Admin API, sin verificador PKCE del navegador) devuelven el token en el
 * FRAGMENTO de la URL (`#access_token=...&type=invite`), que nunca llega al
 * servidor — solo un componente cliente puede leerlo.
 *
 * Usa un cliente Supabase propio con `detectSessionInUrl: false`: el cliente
 * por defecto (`lib/supabase/client.ts`) procesa ese fragmento de forma
 * automática y asíncrona apenas se instancia — eso genera una carrera real
 * contra la lectura del `type` en este mismo componente (el SDK puede limpiar
 * el hash antes de que alcancemos a leerlo), haciendo que una invitación real
 * termine enrutada como un login cualquiera, sin pasar por /auth/set-password.
 * Al desactivarlo, extraemos el token del hash a mano y llamamos setSession()
 * nosotros mismos — sin ambigüedad de orden de ejecución.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { detectSessionInUrl: false } },
    );

    const params = new URLSearchParams(window.location.search);
    const next = params.get('next') ?? '/dashboard';
    const code = params.get('code');

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hashType = hashParams.get('type');
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const isFirstTimeSetup = hashType === 'invite' || hashType === 'recovery';

    const finish = (session: unknown) => {
      if (!session) {
        setError(true);
        return;
      }
      router.replace(isFirstTimeSetup ? '/auth/set-password' : next);
    };

    if (code) {
      // Magic-link autoiniciado desde /login ("Enlace mágico") — sí tenía
      // verificador PKCE del navegador, viene como ?code=.
      supabase.auth.exchangeCodeForSession(code).then(({ data, error: exchangeError }) => {
        if (exchangeError) setError(true); else finish(data.session);
      });
      return;
    }

    if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data, error: sessionError }) => {
          if (sessionError) setError(true); else finish(data.session);
        });
      return;
    }

    setError(true);
  }, [router]);

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
