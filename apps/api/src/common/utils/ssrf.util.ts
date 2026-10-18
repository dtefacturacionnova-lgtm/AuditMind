import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Protección SSRF (auditoría de seguridad 2026-10-18). Cualquier URL que decide
 * un usuario y que el servidor va a pedir (ingesta RAG por URL, conectores
 * REST, recursos dentro de un PDF renderizado por Chromium) debe apuntar a una
 * IP PÚBLICA: nunca a 127.0.0.1 (ai-service :8003, Stirling :8090, API :4003),
 * redes privadas ni metadatos de la nube (169.254.169.254).
 * El ai-service repite esta validación en cada redirección (url_guard.py).
 */

function isPublicIpv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  if (a === 10 || a === 127 || a === 0) return false;
  if (a === 169 && b === 254) return false;          // link-local / metadatos
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a >= 224) return false;                         // multicast / reservado
  return true;
}

export function isPublicIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPublicIpv4(ip);
  if (v === 6) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicIpv4(mapped[1]);
    if (lower === '::1' || lower === '::') return false;
    if (/^f[cd]/.test(lower)) return false;      // ULA fc00::/7
    if (/^fe[89ab]/.test(lower)) return false;   // link-local fe80::/10
    if (/^ff/.test(lower)) return false;         // multicast
    return true;
  }
  return false;
}

/** true si el host resuelve EXCLUSIVAMENTE a IPs públicas. */
export async function isPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return isPublicIp(host);
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return false;
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => isPublicIp(a.address));
  } catch {
    return false;
  }
}

/** Lanza 400 si la URL no es http(s) o no apunta a un host público. */
export async function assertPublicHttpUrl(raw: string, label = 'La URL'): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException(`${label} no es válida.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException(`${label} debe empezar con http:// o https://.`);
  }
  if (!(await isPublicHost(url.hostname))) {
    throw new BadRequestException(`${label} apunta a una dirección interna o privada — no está permitido.`);
  }
}
