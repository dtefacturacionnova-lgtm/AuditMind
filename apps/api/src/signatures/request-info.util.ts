/**
 * IP y navegador del firmante para la evidencia (docs/firma-externa-por-enlace.md §7).
 * Con `trust proxy = 'loopback'` (main.ts), Express deja en `req.ip` la IP real que nginx
 * agregó a X-Forwarded-For; una IP falsa metida por el cliente queda a la izquierda y se ignora.
 */
export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

const MAX_UA = 500;

export function getClientInfo(req: { ip?: string; headers?: Record<string, unknown> }): ClientInfo {
  let ip = typeof req.ip === 'string' && req.ip ? req.ip : null;
  if (ip && ip.startsWith('::ffff:')) ip = ip.slice(7); // IPv4 mapeada en IPv6
  const ua = req.headers?.['user-agent'];
  const userAgent = typeof ua === 'string' && ua ? ua.replace(/[\r\n\0]/g, ' ').slice(0, MAX_UA) : null;
  return { ip, userAgent };
}
