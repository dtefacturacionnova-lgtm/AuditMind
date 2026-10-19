/** @type {import('next').NextConfig} */

/**
 * Encabezados de las páginas PÚBLICAS (firma, verificación y portal PBC; docs/firma-externa-por-enlace.md §14.3):
 *  - nada puede incrustar estas páginas (clickjacking sobre el botón "Firmar"): frame-ancestors 'none' + X-Frame-Options;
 *  - la página solo incrusta su propio contenido y blobs (el PDF ya verificado, servido por la API);
 *  - sin Referer (el fragmento #token nunca viaja, pero así tampoco la dirección de la página);
 *  - sin caché, sin indexado.
 *
 * Deliberadamente NO se fija script-src: Next.js inyecta scripts en línea para hidratar y un script-src estricto
 * exigiría nonces por petición. El token del enlace no está en el HTML ni en la URL del servidor, y la superficie de
 * XSS es mínima (no se pinta HTML recibido: todo texto va escapado por React).
 *
 * Tampoco se fija object-src 'none': los blobs heredan la política de la página y el visor de PDF de algunos
 * navegadores usa <embed>/<object> por dentro. Se comprobó que Chromium 152 lo permite, pero Safari y Firefox no se
 * pudieron probar, y quedarse sin ver el documento en un teléfono pesa más que lo que aporta esa directiva (estas
 * páginas no contienen <object> ni <embed> propios).
 */
function publicPageHeaders(frameSrc) {
  const csp = [
    "frame-ancestors 'none'",
    `frame-src ${frameSrc}`,
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    { key: 'Cache-Control', value: 'no-store' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
  ];
}

const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['avatars.githubusercontent.com'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  // Sin rewrite de `/api/*` hacia la API (revisión F5b, 2026-10-19): nadie lo usaba (el navegador llama a
  // NEXT_PUBLIC_API_URL) y Next compara rutas sin distinguir mayúsculas: `/API/...` esquivaba el `location /api/` de
  // nginx, entraba por Next y llegaba a la API desde el propio servidor, con la IP del VPS en la evidencia de la firma.
  async headers() {
    // La firma incrusta SOLO el PDF ya verificado (blob:, bytes servidos por la API); ningún origen externo, ni Storage
    // (revisión F5b, 2026-10-19). El portal PBC no incrusta nada.
    const signFrames = "'self' blob:";
    return [
      // `:path*` también coincide con la ruta sin subruta (/firmar, /verificar, /portal).
      { source: '/firmar/:path*', headers: publicPageHeaders(signFrames) },
      { source: '/verificar/:path*', headers: publicPageHeaders(signFrames) },
      { source: '/portal/:path*', headers: publicPageHeaders("'none'") },
    ];
  },
};

module.exports = nextConfig;
