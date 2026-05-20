import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const ROLE_HOME: Record<string, string> = {
  SUPER_ADMIN: '/dashboard',
  ADMIN: '/dashboard',
  CAE: '/dashboard',
  AUDIT_MANAGER: '/dashboard',
  SENIOR_AUDITOR: '/dashboard/audits',
  AUDITOR: '/dashboard/audits',
  AUDITEE: '/portal-redirect',
  READ_ONLY: '/dashboard',
};

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as any),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  // Ruta de login: si ya tiene sesión, redirige al dashboard según rol
  if (pathname === '/login') {
    if (user) {
      const role = (user.app_metadata?.role as string) ?? 'AUDITOR';
      const home = ROLE_HOME[role] ?? '/dashboard';
      return NextResponse.redirect(new URL(home, request.url));
    }
    return response;
  }

  // Rutas protegidas /dashboard/*
  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // AUDITEE no tiene acceso al dashboard principal
    const role = (user.app_metadata?.role as string) ?? '';
    if (role === 'AUDITEE') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/login',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
