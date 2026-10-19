/** @type {import('next').NextConfig} */

// Origen de Supabase Storage (de donde sale el PDF a firmar, por URL firmada de 10 min). Se permite en frame-src
// de las páginas de firma; el resto de orígenes externos NO se pueden incrustar.
function supabaseOrigin() {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : null;
  } catch {
    return null;
  }
}

/**
 * Encabezados de las páginas PÚBLICAS (firma, verificación y portal PBC; docs/firma-externa-por-enlace.md §14.3):
 *  - nada puede incrustar estas páginas (clickjacking sobre el botón "Firmar"): frame-ancestors 'none' + X-Frame-Options;
 *  - la página solo incrusta su propio contenido, blobs (el PDF ya verificado) y Storage;
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
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}/:path*`,
      },
    ];
  },
  async headers() {
    const storage = supabaseOrigin();
    // La firma incrusta el PDF a firmar (blob ya verificado o URL firmada de Storage); el portal PBC no incrusta nada.
    const signFrames = `'self' blob:${storage ? ` ${storage}` : ''}`;
    return [
      // `:path*` también coincide con la ruta sin subruta (/firmar, /verificar, /portal).
      { source: '/firmar/:path*', headers: publicPageHeaders(signFrames) },
      { source: '/verificar/:path*', headers: publicPageHeaders(signFrames) },
      { source: '/portal/:path*', headers: publicPageHeaders("'none'") },
    ];
  },
};

module.exports = nextConfig;
