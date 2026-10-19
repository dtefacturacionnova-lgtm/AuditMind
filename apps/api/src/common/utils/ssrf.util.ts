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
 *
 * IPv6 se analiza por sus 128 bits, no por texto (revisión F5b, 2026-10-19): el analizador de URL normaliza
 * `[::ffff:127.0.0.1]` a `[::ffff:7f00:1]`, y una comparación con la forma decimal dejaba pasar loopback.
 * Las direcciones que llevan una IPv4 adentro (mapeada, NAT64, 6to4) se juzgan por esa IPv4.
 */

function isPublicIpv4(ip: string): boolean {
  const [a, b, c] = ip.split('.').map(Number);
  if (a === 10 || a === 127 || a === 0) return false;
  if (a === 169 && b === 254) return false;          // link-local / metadatos
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF / documentación
  if (a === 198 && (b === 18 || b === 19)) return false;           // pruebas de rendimiento
  if (a === 198 && b === 51 && c === 100) return false;            // documentación
  if (a === 203 && b === 0 && c === 113) return false;             // documentación
  if (a >= 224) return false;                         // multicast / reservado
  return true;
}

/** Los 8 grupos de 16 bits de una IPv6 (admite `::`, una IPv4 al final y zona `%eth0`), o null si no es válida. */
export function ipv6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/%.*$/, '');
  let tail: number[] = [];
  // IPv4 al final (`::ffff:1.2.3.4`, `64:ff9b::1.2.3.4`): se convierte en los dos últimos grupos.
  const v4 = s.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const o = v4.slice(2).map(Number);
    if (o.some((n) => n > 255)) return null;
    tail = [(o[0] << 8) | o[1], (o[2] << 8) | o[3]];
    s = v4[1].endsWith('::') ? v4[1] : v4[1].slice(0, -1); // se quita el ':' que la separaba (salvo si es '::')
  }
  const parts = s.split('::');
  if (parts.length > 2) return null;
  const parse = (chunk: string) => (chunk === '' ? [] : chunk.split(':'));
  const head = parse(parts[0]);
  const rest = parts.length === 2 ? parse(parts[1]) : [];
  if ([...head, ...rest].some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  const known = head.length + rest.length + tail.length;
  if (parts.length === 1 ? known !== 8 : known > 7) return null;
  const zeros = new Array(8 - known).fill(0);
  return [...head.map((h) => parseInt(h, 16)), ...zeros, ...rest.map((h) => parseInt(h, 16)), ...tail];
}

const v4From = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

function isPublicIpv6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (!g) return false;
  const zero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (zero(0, 5) && g[5] === 0xffff) return isPublicIpv4(v4From(g[6], g[7]));  // ::ffff:a.b.c.d (mapeada)
  if (zero(0, 6)) return false;                                                // ::, ::1 y ::a.b.c.d (obsoleta)
  if (g[0] === 0x64 && g[1] === 0xff9b) return zero(2, 6) && isPublicIpv4(v4From(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return isPublicIpv4(v4From(g[1], g[2]));                // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return false;                             // Teredo (IPv4 ofuscada)
  if (g[0] === 0x2001 && g[1] === 0xdb8) return false;                         // documentación
  if (g[0] === 0x100 && zero(1, 4)) return false;                              // descarte 100::/64
  if ((g[0] & 0xfe00) === 0xfc00) return false;                                // ULA fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return false;   // link-local y site-local
  if ((g[0] & 0xff00) === 0xff00) return false;                                // multicast
  return true;
}

export function isPublicIp(ip: string): boolean {
  const v = isIP(ip.replace(/%.*$/, ''));
  if (v === 4) return isPublicIpv4(ip);
  if (v === 6) return isPublicIpv6(ip);
  return false;
}

/** true si el host resuelve EXCLUSIVAMENTE a IPs públicas. */
export async function isPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIP(host.replace(/%.*$/, ''))) return isPublicIp(host);
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
