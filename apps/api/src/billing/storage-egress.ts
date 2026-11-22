/**
 * Medición de DESCARGAS (egress) — parte PURA, sin base de datos (se prueba sola).
 *
 * Qué se mide: los ENLACES DE DESCARGA emitidos. El navegador baja los archivos directo de Supabase con una URL firmada que el API entrega
 * en sus respuestas; el API no ve los bytes que sirve Supabase. Por eso cada archivo cuenta UNA vez por día y organización (abrir cinco veces
 * el mismo video el mismo día cuenta una; un enlace entregado que nadie abrió también cuenta). Es un indicador para comparar organizaciones y
 * vigilar el video/audio, no la factura de Supabase: la cifra real está en el panel del proveedor.
 */

/** Tarifas de referencia del egress (verificadas 2026-11-21 en las páginas oficiales; el superadmin las usa para estimar). */
export const EGRESS_RATES = {
  /** Supabase Pro incluye 250 GB de egress al mes en TODO el proyecto; lo que pase se cobra a este precio por GB. */
  supabaseIncludedGb: 250,
  supabaseUsdPerGb: 0.09,
  /** Cloudflare R2 no cobra las descargas. */
  r2UsdPerGb: 0,
} as const;

/** Tope de la memoria que evita contar dos veces el mismo archivo el mismo día (si se llena se vacía: cuenta de más, nunca de menos). */
export const EGRESS_DEDUP_MAX = 50_000;

/** Misma regla que el cron de avisos: `true` fuerza, `false` apaga, y sin valor solo corre en producción (el desarrollo local comparte la base con producción). */
export function egressMeterEnabled(flag: string | undefined, nodeEnv: string | undefined): boolean {
  const f = (flag ?? '').trim().toLowerCase();
  if (f === 'true') return true;
  if (f === 'false') return false;
  return nodeEnv === 'production';
}

/** Día en UTC como `AAAA-MM-DD` (la clave de la fila de la tabla y de la memoria contra repeticiones). */
export function egressDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** La ruta como suele guardarse dentro de una URL: cada tramo codificado, las barras intactas. */
export function encodeStoragePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export interface EgressEntry {
  organizationId: string;
  day: string;
  fileType: string;
  files: number;
  bytes: number;
}

/** Suma pendiente de escribir en la base: una entrada por (organización, día, tipo). */
export class EgressAccumulator {
  private readonly map = new Map<string, EgressEntry>();

  add(organizationId: string, day: string, fileType: string, bytes: number): void {
    const safe = Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : 0;
    const key = `${organizationId}|${day}|${fileType}`;
    const cur = this.map.get(key) ?? { organizationId, day, fileType, files: 0, bytes: 0 };
    cur.files += 1;
    cur.bytes += safe;
    this.map.set(key, cur);
  }

  get size(): number {
    return this.map.size;
  }

  /** Entrega todo lo pendiente y deja el acumulador vacío. */
  drain(): EgressEntry[] {
    const out = [...this.map.values()];
    this.map.clear();
    return out;
  }
}

export interface EgressCosts {
  totalGb: number;
  overageGb: number;
  overageCostUsd: number;
  /** Costo atribuido a cada organización: el excedente se reparte según los GB que descargó cada una. */
  byOrg: Map<string, number>;
}

/**
 * Costo estimado del egress en Supabase. Los 250 GB incluidos son del proyecto entero, así que mientras el total no los pase el costo es 0
 * para todos; si los pasa, el excedente se reparte entre las organizaciones en proporción a lo que descargó cada una.
 */
export function egressCosts(gbByOrg: ReadonlyMap<string, number>, includedGb: number, usdPerGb: number): EgressCosts {
  const clean = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  let totalGb = 0;
  for (const gb of gbByOrg.values()) totalGb += clean(gb);
  const overageGb = Math.max(0, totalGb - clean(includedGb));
  const overageCostUsd = overageGb * clean(usdPerGb);
  const byOrg = new Map<string, number>();
  for (const [org, gb] of gbByOrg) byOrg.set(org, totalGb > 0 ? overageCostUsd * (clean(gb) / totalGb) : 0);
  return { totalGb, overageGb, overageCostUsd, byOrg };
}
