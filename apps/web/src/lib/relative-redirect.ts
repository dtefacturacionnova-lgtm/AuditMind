import { NextResponse, type NextRequest } from 'next/server';

/**
 * Redirección del middleware hacia el dominio PÚBLICO.
 *
 * Detrás de nginx, Next escucha en 127.0.0.1:3008 y `request.url` trae ese origen interno (`https://localhost:3008/...`): un
 * `NextResponse.redirect(new URL('/login', request.url))` mandaba al usuario a un sitio que no existe (2026-10-27: quien ya tenía
 * sesión y abría la app caía en https://localhost:3008/dashboard). Next exige una URL ABSOLUTA en la redirección de un middleware (una
 * ruta relativa lanza «Invalid URL»), así que el origen se arma con lo que nginx reenvía (`Host` y `X-Forwarded-Proto`). Sin esas
 * cabeceras (desarrollo local) se conserva el origen de la petición, como antes.
 */
const HOST_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i;
const first = (v: string | null): string => (v ?? '').split(',')[0].trim();

export function publicOrigin(headers: Pick<Headers, 'get'>, fallbackOrigin: string): string {
  const host = first(headers.get('x-forwarded-host')) || first(headers.get('host'));
  const proto = first(headers.get('x-forwarded-proto')).toLowerCase();
  if ((proto === 'http' || proto === 'https') && host && HOST_RE.test(host)) return `${proto}://${host}`;
  return fallbackOrigin;
}

export function redirectTo(request: NextRequest, path: string): NextResponse {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\\r\n]/.test(path)) throw new Error('Ruta de redirección no válida');
  return NextResponse.redirect(new URL(path, publicOrigin(request.headers, request.nextUrl.origin)));
}
