import type { AdminConsumption, ConsumptionAgentRow, ConsumptionEgress, ConsumptionOrgRow } from './admin-types';
import { ASSISTANT_INFO, FILE_TYPE_KEYS, isAssistantKey, isStatus, STATUS_LABEL, type FileTypeKey } from './catalog';
import type { ClientAiUsage, ClientStorageUsage } from './client-types';

/**
 * Consumo de IA (en peticiones) y de espacio: lo que ve el cliente en «Mi plan» y lo que ve el superadmin en «Consumo y costos».
 * Todo es puro y se prueba aparte. REGLA: nada de dinero en lo del cliente; el superadmin ve dinero Y peticiones.
 * Las barras nunca pasan de 100 % al dibujarse y nunca producen NaN (capacidad 0 o sin tope).
 */

export const BYTES_PER_GB = 1024 ** 3;
/** Desde este porcentaje se avisa («cerca del límite»). */
export const WARN_PCT = 80;
/** Margen por debajo del cual se marca la organización (el de la maqueta aprobada). */
export const LOW_MARGIN_PCT = 50;

// ── Números y textos ──

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const nullableNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(v, 0) : null);

/** Entero con separador de miles; «—» si no es un número. */
export function countText(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

/** Tamaño legible: «512 KB», «18.4 GB», «1.2 TB». Los bytes y KB van sin decimales; lo demás con uno. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  // Si al redondear llega a 1,024 se sube de unidad (1,023.96 MB → 1.0 GB).
  while (i < units.length - 1 && (i < 2 ? Math.round(v) : Math.round(v * 10) / 10) >= 1024) {
    v /= 1024;
    i++;
  }
  const digits = i < 2 ? 0 : 1;
  return `${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${units[i]}`;
}

/** Tamaño de un plan o de un paquete en GB: «100 GB», «0.5 GB». */
export function gbText(gb: number | null | undefined): string {
  if (gb === null || gb === undefined || !Number.isFinite(gb) || gb < 0) return '—';
  return `${gb.toLocaleString('en-US', { maximumFractionDigits: 1 })} GB`;
}

/** Dinero: 2 decimales, y 4 si el monto es menor de un centavo para no mostrar «$0.00» donde sí hay costo. */
export function costText(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const digits = abs > 0 && abs < 0.01 ? 4 : 2;
  const body = abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${n < 0 ? '-' : ''}$${body}`;
}

// ── Porcentajes y barras ──

/** Qué parte de la capacidad se usó, en %. null = sin tope (no hay barra). Con capacidad 0 no divide: 100 si se usó algo, 0 si no. */
export function ratioPct(used: number, capacity: number | null | undefined): number | null {
  if (capacity === null || capacity === undefined || !Number.isFinite(capacity)) return null;
  const u = Number.isFinite(used) && used > 0 ? used : 0;
  if (capacity <= 0) return u > 0 ? 100 : 0;
  return (u / capacity) * 100;
}

/** Ancho de la barra: de 0 a 100, nunca NaN ni más de 100. */
export function barWidth(pct: number | null | undefined): number {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}

/** «82 %». Más de 999 se muestra «+999 %». */
export function pctText(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—';
  if (pct > 999) return '+999 %';
  return `${Math.round(pct)} %`;
}

export type MeterLevel = 'none' | 'ok' | 'warn' | 'full';

/** none = sin tope (sin barra), ok < 80 %, warn desde 80 %, full desde 100 %. */
export function meterLevel(pct: number | null | undefined): MeterLevel {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return 'none';
  if (pct >= 100) return 'full';
  if (pct >= WARN_PCT) return 'warn';
  return 'ok';
}

// ── Cliente: peticiones de IA ──

export interface AiMeter {
  unlimited: boolean;
  used: number;
  /** Lo que se puede gastar este mes: lo incluido + lo comprado (gastado y por gastar). null = sin tope. */
  capacity: number | null;
  /** Lo que queda (plan + paquetes). null = sin tope. */
  available: number | null;
  included: number | null;
  packRemaining: number;
  pct: number | null;
  level: MeterLevel;
  valueText: string;
  note: string;
}

/** Barra de peticiones de IA del mes con lo comprado en paquetes. Tolera respuestas incompletas. */
export function aiMeter(ai: Partial<ClientAiUsage> | null | undefined): AiMeter {
  const used = num(ai?.used);
  const usedFromPlan = num(ai?.usedFromPlan);
  const packRemaining = num(ai?.packRemaining);
  const included = nullableNum(ai?.included);
  const packUsed = Math.max(used - usedFromPlan, 0);
  const capacity = included === null ? null : included + packUsed + packRemaining;
  const available = nullableNum(ai?.available);
  const pct = ratioPct(used, capacity);
  const level = meterLevel(pct);
  const unlimited = included === null;

  let note: string;
  if (unlimited) note = 'Tu plan no tiene tope de peticiones de IA.';
  else if (available !== null && available <= 0) note = 'Llegaste al límite de peticiones de este mes.';
  else {
    const left = available ?? Math.max((capacity ?? 0) - used, 0);
    note = `Te quedan ${countText(left)} ${left === 1 ? 'petición' : 'peticiones'}`;
    note += packRemaining > 0 ? ` (${countText(packRemaining)} de paquetes comprados, que no vencen por mes).` : '.';
  }

  return {
    unlimited, used, capacity, available, included, packRemaining, pct, level,
    valueText: unlimited ? `${countText(used)} usadas · sin tope` : `${countText(used)} de ${countText(capacity)}`,
    note,
  };
}

// ── Cliente: espacio ──

export interface StorageMeter {
  usedBytes: number;
  limitBytes: number | null;
  pct: number | null;
  level: MeterLevel;
  valueText: string;
  note: string;
}

export function storageMeter(storage: Partial<ClientStorageUsage> | null | undefined): StorageMeter {
  const usedBytes = num(storage?.usedBytes);
  const limitGb = nullableNum(storage?.limitGb);
  const limitBytes = limitGb === null ? null : limitGb * BYTES_PER_GB;
  const pct = ratioPct(usedBytes, limitBytes);
  const extra = num(storage?.extraGb);
  const maxMb = nullableNum(storage?.maxFileMb);
  const parts: string[] = [];
  if (maxMb !== null) parts.push(`Archivo máximo: ${maxMb >= 1024 && maxMb % 1024 === 0 ? `${maxMb / 1024} GB` : `${countText(maxMb)} MB`}.`);
  if (extra > 0) parts.push(`Incluye ${gbText(extra)} comprados.`);
  parts.push('Se comparte entre evidencia, papeles, portal de auditados y firmas.');
  return {
    usedBytes, limitBytes, pct, level: meterLevel(pct),
    valueText: limitBytes === null ? `${formatBytes(usedBytes)} · sin tope` : `${formatBytes(usedBytes)} de ${gbText(limitGb)}`,
    note: parts.join(' '),
  };
}

export interface TypeSlice {
  key: FileTypeKey;
  bytes: number;
  /** % del total ocupado (0 si no hay nada). */
  share: number;
}

/** Espacio por tipo de archivo: los siete tipos, del que más ocupa al que menos. Ignora claves desconocidas y valores raros. */
export function typeBreakdown(byType: Partial<Record<string, number>> | null | undefined): { slices: TypeSlice[]; totalBytes: number } {
  const raw = FILE_TYPE_KEYS.map((key) => ({ key, bytes: num(byType?.[key]) }));
  const totalBytes = raw.reduce((t, r) => t + r.bytes, 0);
  const slices = raw
    .map((r) => ({ ...r, share: totalBytes > 0 ? (r.bytes / totalBytes) * 100 : 0 }))
    .sort((a, b) => b.bytes - a.bytes || FILE_TYPE_KEYS.indexOf(a.key) - FILE_TYPE_KEYS.indexOf(b.key));
  return { slices, totalBytes };
}

export interface AgentSlice {
  agent: string;
  /** Especialidad del asistente si es uno conocido. */
  info: string | null;
  requests: number;
  /** Ancho de la barra respecto del que más usó (el primero llena la barra). */
  barPct: number;
  /** % de todas las peticiones del mes. */
  share: number;
}

/** Peticiones por asistente, de mayor a menor; deja fuera los que no gastaron nada. */
export function agentBreakdown(rows: ReadonlyArray<{ agent: string; requests: number }> | null | undefined): AgentSlice[] {
  const clean = (Array.isArray(rows) ? rows : [])
    .map((r) => ({ agent: typeof r?.agent === 'string' && r.agent ? r.agent : 'OTROS', requests: num(r?.requests) }))
    .filter((r) => r.requests > 0)
    .sort((a, b) => b.requests - a.requests);
  const max = clean[0]?.requests ?? 0;
  const total = clean.reduce((t, r) => t + r.requests, 0);
  return clean.map((r) => ({
    agent: r.agent,
    info: isAssistantKey(r.agent) ? ASSISTANT_INFO[r.agent] : null,
    requests: r.requests,
    barPct: max > 0 ? (r.requests / max) * 100 : 0,
    share: total > 0 ? (r.requests / total) * 100 : 0,
  }));
}

export interface UsageNotice {
  level: 'warning' | 'critical';
  title: string;
  text: string;
  /** Qué botón «Comprar más» corresponde. */
  buy: 'AI' | 'STORAGE';
}

/**
 * Avisos de consumo del cliente. Solo se afirma que algo se pausa o se bloquea si el servidor bloquea de verdad (ENFORCE);
 * en OFF / OBSERVE el mensaje dice que por ahora no se bloquea nada.
 */
export function usageNotices(
  usage: { ai?: Partial<ClientAiUsage> | null; storage?: Partial<ClientStorageUsage> | null } | null | undefined,
  enforcing: boolean,
): UsageNotice[] {
  if (!usage) return [];
  const out: UsageNotice[] = [];
  const ai = aiMeter(usage.ai);
  if (!ai.unlimited) {
    const exhausted = ai.available !== null ? ai.available <= 0 : ai.level === 'full';
    if (exhausted && ai.capacity === 0 && ai.used === 0) {
      out.push({
        level: 'warning', buy: 'AI', title: 'Tu plan no incluye peticiones de IA.',
        text: enforcing
          ? 'Los asistentes no responderán hasta que compres un paquete de peticiones.'
          : 'Por ahora no se bloquea nada, pero tu plan no incluye peticiones: conviene comprar un paquete.',
      });
    } else if (exhausted) {
      out.push({
        level: 'critical', buy: 'AI', title: 'Llegaste al límite de peticiones de IA de este mes.',
        text: enforcing
          ? 'Los asistentes están en pausa. Compra más peticiones y se reactivan al aprobarse el pago, o espera al próximo mes.'
          : 'Superaste lo que incluye tu plan. Por ahora no se bloquea nada, pero conviene comprar más peticiones.',
      });
    } else if (ai.level === 'warn') {
      out.push({
        level: 'warning', buy: 'AI', title: `Usaste el ${pctText(ai.pct)} de tus peticiones de IA de este mes.`,
        text: enforcing ? 'Al llegar al 100 % los asistentes se pausan hasta que compres más o empiece el próximo mes.' : 'Cuando llegues al límite conviene tener más peticiones.',
      });
    }
  }
  const st = storageMeter(usage.storage);
  if (st.level === 'full') {
    out.push({
      level: 'critical', buy: 'STORAGE', title: 'Tu espacio está lleno.',
      text: enforcing
        ? 'No puedes subir archivos nuevos hasta liberar espacio o comprar más. Lo que ya tienes sigue disponible.'
        : 'Llegaste al espacio incluido en tu plan. Por ahora no se bloquea nada, pero conviene liberar espacio o comprar más.',
    });
  } else if (st.level === 'warn') {
    out.push({
      level: 'warning', buy: 'STORAGE', title: `Usaste el ${pctText(st.pct)} de tu espacio.`,
      text: enforcing ? 'Al llegar al 100 % no podrás subir archivos nuevos. Puedes descargar y archivar lo de auditorías cerradas.' : 'Conviene liberar espacio o comprar más antes de llegar al límite.',
    });
  }
  return out;
}

// ── Superadmin: periodos ──

export const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const;

/** Mes de la plataforma «AAAA-MM» en UTC (el mismo que usa el API para cerrar el mes de consumo). */
export function periodKeyOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const isPeriodKey = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

/** «noviembre 2026». Para una clave inválida devuelve la misma clave. */
export function periodLabel(key: string): string {
  if (!isPeriodKey(key)) return key;
  const [y, m] = key.split('-');
  return `${MONTHS_ES[Number(m) - 1]} ${y}`;
}

/** Los últimos `count` meses (el actual primero) para el selector. */
export function recentPeriods(now: Date, count = 12): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  const n = Math.max(1, Math.min(Math.floor(count) || 1, 60));
  for (let i = 0; i < n; i++) {
    const key = periodKeyOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)));
    out.push({ key, label: periodLabel(key) });
  }
  return out;
}

// ── Superadmin: una organización ──

export type StorageProvider = 'SUPABASE' | 'R2';

export const PROVIDER_LABEL: Record<StorageProvider, string> = { SUPABASE: 'Supabase', R2: 'Cloudflare R2' };

export interface OrgAlert {
  code: 'IA_AGOTADA' | 'IA_CERCA' | 'ESPACIO_LLENO' | 'ESPACIO_CERCA' | 'PIERDE_DINERO' | 'MARGEN_BAJO' | 'SIN_INGRESO';
  level: 'critical' | 'warning' | 'info';
  text: string;
}

/** Etiqueta corta y color de cada alerta, para la tabla. */
export const ALERT_SHORT: Record<OrgAlert['code'], { label: string; tone: 'red' | 'amber' | 'gray' }> = {
  IA_AGOTADA: { label: 'IA agotada', tone: 'red' },
  IA_CERCA: { label: 'IA cerca del límite', tone: 'amber' },
  ESPACIO_LLENO: { label: 'Espacio lleno', tone: 'red' },
  ESPACIO_CERCA: { label: 'Espacio cerca del límite', tone: 'amber' },
  PIERDE_DINERO: { label: 'Pierde dinero', tone: 'red' },
  MARGEN_BAJO: { label: 'Margen bajo', tone: 'amber' },
  SIN_INGRESO: { label: 'Sin ingreso', tone: 'gray' },
};

export interface OrgView {
  id: string;
  name: string;
  planLabel: string;
  statusLabel: string | null;
  exempt: boolean;
  requests: number;
  packRequests: number;
  /** Lo gastado del plan (sin lo que salió de paquetes): lo que se compara con lo incluido. */
  planRequests: number;
  included: number | null;
  requestsPct: number | null;
  requestsLevel: MeterLevel;
  aiCost: number;
  storageBytes: number;
  storageLimitGb: number | null;
  storagePct: number | null;
  storageLevel: MeterLevel;
  storageCost: number;
  /** Descargas del mes: archivos con enlace emitido, sus bytes y la parte del excedente de egress que le toca (con el proveedor elegido). */
  egressFiles: number;
  egressBytes: number;
  egressCost: number;
  totalCost: number;
  income: number;
  margin: number;
  /** null si no hay ingreso. */
  marginPct: number | null;
  alerts: OrgAlert[];
}

/** Una fila del API lista para pintar, con el costo del espacio del proveedor elegido y las alertas. */
export function orgView(row: ConsumptionOrgRow, provider: StorageProvider): OrgView {
  const requests = num(row.requests);
  const packRequests = Math.min(num(row.packRequests), requests);
  const planRequests = requests - packRequests;
  const included = nullableNum(row.requestsIncluded);
  const requestsPct = ratioPct(planRequests, included);
  const storageBytes = num(row.storageGb) * BYTES_PER_GB;
  const limitGb = nullableNum(row.storageLimitGb);
  const storagePct = ratioPct(storageBytes, limitGb === null ? null : limitGb * BYTES_PER_GB);
  const aiCost = num(row.aiCostUsd);
  const storageCost = num(provider === 'R2' ? row.storageCostR2Usd : row.storageCostSupabaseUsd);
  const egressCost = num(provider === 'R2' ? row.egressCostR2Usd : row.egressCostSupabaseUsd);
  const totalCost = aiCost + storageCost + egressCost;
  const income = num(row.monthlyIncomeUsd);
  const margin = income - totalCost;
  const marginPct = income > 0 ? (margin / income) * 100 : null;
  const requestsLevel = meterLevel(requestsPct);
  const storageLevel = meterLevel(storagePct);
  const status = isStatus(row.status) ? STATUS_LABEL[row.status] : null;

  const alerts: OrgAlert[] = [];
  if (requestsLevel === 'full') alerts.push({ code: 'IA_AGOTADA', level: 'critical', text: 'Agotó las peticiones de IA incluidas en su plan este mes.' });
  else if (requestsLevel === 'warn') alerts.push({ code: 'IA_CERCA', level: 'warning', text: `Lleva el ${pctText(requestsPct)} de sus peticiones de IA incluidas: ofrecer un paquete.` });
  if (storageLevel === 'full') alerts.push({ code: 'ESPACIO_LLENO', level: 'critical', text: 'Su espacio está lleno.' });
  else if (storageLevel === 'warn') alerts.push({ code: 'ESPACIO_CERCA', level: 'warning', text: `Usa el ${pctText(storagePct)} de su espacio.` });
  if (marginPct !== null && margin < 0) alerts.push({ code: 'PIERDE_DINERO', level: 'critical', text: `El costo variable (${costText(totalCost)}) supera su ingreso mensual (${costText(income)}).` });
  else if (marginPct !== null && marginPct < LOW_MARGIN_PCT) alerts.push({ code: 'MARGEN_BAJO', level: 'warning', text: `Margen bajo: ${pctText(marginPct)} (el mínimo esperado es ${LOW_MARGIN_PCT} %).` });
  if (income === 0 && totalCost > 0 && !row.exempt) alerts.push({ code: 'SIN_INGRESO', level: 'info', text: 'Consume pero no tiene ingreso este mes (prueba, solo lectura o sin precio cargado).' });

  return {
    id: String(row.organizationId), name: row.organizationName || '—',
    planLabel: row.planName || row.planCode || 'Sin plan', statusLabel: status, exempt: row.exempt === true,
    requests, packRequests, planRequests, included, requestsPct, requestsLevel,
    aiCost, storageBytes, storageLimitGb: limitGb, storagePct, storageLevel, storageCost,
    egressFiles: num(row.egressFiles), egressBytes: num(row.egressBytes), egressCost, totalCost,
    income, margin, marginPct, alerts,
  };
}

export type OrgSort = 'COST' | 'REQUESTS' | 'MARGIN' | 'NAME';

export const ORG_SORT_LABEL: Record<OrgSort, string> = {
  COST: 'Costo total (el más caro primero)', REQUESTS: 'Peticiones (las más usadas primero)',
  MARGIN: 'Margen (el más bajo primero)', NAME: 'Organización (A–Z)',
};

/** Ordena sin tocar la lista recibida. En el margen, las organizaciones sin ingreso van al final. */
export function sortOrgs(views: readonly OrgView[], by: OrgSort): OrgView[] {
  const byName = (a: OrgView, b: OrgView) => a.name.localeCompare(b.name, 'es');
  return [...views].sort((a, b) => {
    switch (by) {
      case 'REQUESTS': return b.requests - a.requests || byName(a, b);
      case 'MARGIN': {
        if (a.marginPct === null && b.marginPct === null) return b.totalCost - a.totalCost || byName(a, b);
        if (a.marginPct === null) return 1;
        if (b.marginPct === null) return -1;
        return a.marginPct - b.marginPct || byName(a, b);
      }
      case 'NAME': return byName(a, b);
      case 'COST':
      default: return b.totalCost - a.totalCost || byName(a, b);
    }
  });
}

// ── Superadmin: totales ──

export interface ConsumptionTotals {
  orgs: number;
  requests: number;
  aiCost: number;
  storageBytes: number;
  storageCost: number;
  egressFiles: number;
  egressBytes: number;
  egressCost: number;
  income: number;
  variableCost: number;
  margin: number;
  /** null si no hay ingreso. */
  marginPct: number | null;
}

export function consumptionTotals(views: readonly OrgView[]): ConsumptionTotals {
  const t = { orgs: views.length, requests: 0, aiCost: 0, storageBytes: 0, storageCost: 0, egressFiles: 0, egressBytes: 0, egressCost: 0, income: 0 };
  for (const v of views) {
    t.requests += v.requests;
    t.aiCost += v.aiCost;
    t.storageBytes += v.storageBytes;
    t.storageCost += v.storageCost;
    t.egressFiles += v.egressFiles;
    t.egressBytes += v.egressBytes;
    t.egressCost += v.egressCost;
    t.income += v.income;
  }
  const variableCost = t.aiCost + t.storageCost + t.egressCost;
  const margin = t.income - variableCost;
  return { ...t, variableCost, margin, marginPct: t.income > 0 ? (margin / t.income) * 100 : null };
}

export interface TypeTotal {
  key: FileTypeKey;
  bytes: number;
  share: number;
  /** Estimado: GB × tarifa del proveedor (no es una cifra facturada por tipo). */
  estCost: number;
  /** Ancho de la barra respecto del tipo que más ocupa. */
  barPct: number;
}

/** Espacio de toda la plataforma por tipo de archivo (suma de las organizaciones) y su costo estimado con la tarifa del proveedor. */
export function typeTotals(rows: ReadonlyArray<Pick<ConsumptionOrgRow, 'storageByType'>>, provider: StorageProvider, rates: { supabase: number; cloudflareR2: number }): { types: TypeTotal[]; totalBytes: number; measured: number } {
  const sum: Record<FileTypeKey, number> = Object.fromEntries(FILE_TYPE_KEYS.map((k) => [k, 0])) as Record<FileTypeKey, number>;
  let measured = 0;
  for (const r of rows) {
    if (!r.storageByType) continue;
    measured++;
    for (const k of FILE_TYPE_KEYS) sum[k] += num(r.storageByType[k]);
  }
  const totalBytes = FILE_TYPE_KEYS.reduce((t, k) => t + sum[k], 0);
  const rate = num(provider === 'R2' ? rates?.cloudflareR2 : rates?.supabase);
  const max = Math.max(0, ...FILE_TYPE_KEYS.map((k) => sum[k]));
  const types = FILE_TYPE_KEYS
    .map((key) => ({
      key, bytes: sum[key], share: totalBytes > 0 ? (sum[key] / totalBytes) * 100 : 0,
      estCost: (sum[key] / BYTES_PER_GB) * rate, barPct: max > 0 ? (sum[key] / max) * 100 : 0,
    }))
    .sort((a, b) => b.bytes - a.bytes || FILE_TYPE_KEYS.indexOf(a.key) - FILE_TYPE_KEYS.indexOf(b.key));
  return { types, totalBytes, measured };
}

export interface EgressTypeTotal {
  key: FileTypeKey;
  bytes: number;
  share: number;
  /** Ancho de la barra respecto del tipo que más se descargó. */
  barPct: number;
}

/** Descargas de toda la plataforma en el mes por tipo de archivo (suma de las organizaciones), de mayor a menor. */
export function egressTypeTotals(rows: ReadonlyArray<Pick<ConsumptionOrgRow, 'egressByType'>>): { types: EgressTypeTotal[]; totalBytes: number } {
  const sum: Record<FileTypeKey, number> = Object.fromEntries(FILE_TYPE_KEYS.map((k) => [k, 0])) as Record<FileTypeKey, number>;
  for (const r of rows) {
    if (!r.egressByType) continue;
    for (const k of FILE_TYPE_KEYS) sum[k] += num(r.egressByType[k]);
  }
  const totalBytes = FILE_TYPE_KEYS.reduce((t, k) => t + sum[k], 0);
  const max = Math.max(0, ...FILE_TYPE_KEYS.map((k) => sum[k]));
  const types = FILE_TYPE_KEYS
    .map((key) => ({ key, bytes: sum[key], share: totalBytes > 0 ? (sum[key] / totalBytes) * 100 : 0, barPct: max > 0 ? (sum[key] / max) * 100 : 0 }))
    .sort((a, b) => b.bytes - a.bytes || FILE_TYPE_KEYS.indexOf(a.key) - FILE_TYPE_KEYS.indexOf(b.key));
  return { types, totalBytes };
}

/** Texto de la tarjeta «Descargas del mes» del superadmin: cifra, línea de costo y nota. Dice «no medido» (nunca «0») si el servidor no puede medir. */
export function egressKpi(
  totals: Pick<ConsumptionTotals, 'egressBytes' | 'egressFiles' | 'egressCost'>,
  egress: ConsumptionEgress,
  provider: StorageProvider,
): { value: string; sub: string; note: string } {
  const note = 'Enlaces de descarga emitidos: cada archivo cuenta una vez por día. Es una guía, no la factura de Supabase.';
  if (!egress.measured) return { value: 'No medido', sub: 'El servidor aún no puede medir las descargas', note: 'Falta aplicar el SQL de descargas en la base de datos.' };
  const files = `${countText(totals.egressFiles)} ${totals.egressFiles === 1 ? 'archivo' : 'archivos'}`;
  if (provider === 'R2') return { value: formatBytes(totals.egressBytes), sub: `${files} · Cloudflare R2 no cobra descargas`, note };
  const included = egress.includedGb > 0 ? `${gbText(egress.totalGb)} de ${gbText(egress.includedGb)} incluidos` : gbText(egress.totalGb);
  const cost = egress.overageGb > 0 ? `excedente ${gbText(egress.overageGb)} ≈ ${costText(totals.egressCost)}` : 'sin costo mientras no pase lo incluido';
  return { value: formatBytes(totals.egressBytes), sub: `${files} · ${included}`, note: `${cost.charAt(0).toUpperCase()}${cost.slice(1)}. ${note}` };
}

export interface AgentTotal {
  agent: string;
  info: string | null;
  requests: number;
  costUsd: number;
  share: number;
  barPct: number;
}

/** Consumo por asistente (todas las organizaciones): peticiones y dinero, de mayor a menor. */
export function agentTotals(rows: ReadonlyArray<ConsumptionAgentRow> | null | undefined): AgentTotal[] {
  const clean = (Array.isArray(rows) ? rows : [])
    .map((r) => ({ agent: typeof r?.agent === 'string' && r.agent ? r.agent : 'OTROS', requests: num(r?.requests), costUsd: num(r?.costUsd) }))
    .filter((r) => r.requests > 0 || r.costUsd > 0)
    .sort((a, b) => b.requests - a.requests || b.costUsd - a.costUsd);
  const max = clean[0]?.requests ?? 0;
  const total = clean.reduce((t, r) => t + r.requests, 0);
  return clean.map((r) => ({
    ...r, info: isAssistantKey(r.agent) ? ASSISTANT_INFO[r.agent] : null,
    share: total > 0 ? (r.requests / total) * 100 : 0, barPct: max > 0 ? (r.requests / max) * 100 : 0,
  }));
}

/** Organizaciones que conviene vigilar este mes (con su alerta más grave primero): oportunidades de venta y riesgos. */
export function attentionList(views: readonly OrgView[]): Array<{ id: string; name: string; alert: OrgAlert }> {
  const weight = { critical: 0, warning: 1, info: 2 } as const;
  const out: Array<{ id: string; name: string; alert: OrgAlert }> = [];
  for (const v of views) {
    const worst = [...v.alerts].sort((a, b) => weight[a.level] - weight[b.level])[0];
    if (worst && worst.level !== 'info') out.push({ id: v.id, name: v.name, alert: worst });
  }
  return out.sort((a, b) => weight[a.alert.level] - weight[b.alert.level] || a.name.localeCompare(b.name, 'es'));
}

/** Cuánto costaría el espacio de todas las organizaciones con cada proveedor (para compararlos). */
export function providerComparison(rows: ReadonlyArray<Pick<ConsumptionOrgRow, 'storageCostSupabaseUsd' | 'storageCostR2Usd'>>): { supabase: number; r2: number } {
  return {
    supabase: rows.reduce((t, r) => t + num(r.storageCostSupabaseUsd), 0),
    r2: rows.reduce((t, r) => t + num(r.storageCostR2Usd), 0),
  };
}

/** ¿El mes elegido es el que está corriendo? (Si no, el espacio y el ingreso son los de hoy, no los de ese mes.) */
export function isCurrentPeriod(key: string, now: Date): boolean {
  return key === periodKeyOf(now);
}

/** Respuesta del API ya limpia: listas siempre listas, números siempre números. */
export function normalizeConsumption(raw: Partial<AdminConsumption> | null | undefined): AdminConsumption & { egress: ConsumptionEgress } {
  const eg = raw?.egress;
  return {
    periodKey: isPeriodKey(raw?.periodKey) ? raw!.periodKey! : '',
    costPerRequestUsd: num(raw?.costPerRequestUsd),
    safetyMultiplier: num(raw?.safetyMultiplier),
    rates: { supabase: num(raw?.rates?.supabase), cloudflareR2: num(raw?.rates?.cloudflareR2) },
    // Un API anterior a la medición no manda `egress`: se trata como «no medido», no como cero descargas.
    egress: {
      measured: eg?.measured === true, includedGb: num(eg?.includedGb), supabaseUsdPerGb: num(eg?.supabaseUsdPerGb), r2UsdPerGb: num(eg?.r2UsdPerGb),
      totalGb: num(eg?.totalGb), overageGb: num(eg?.overageGb), overageCostSupabaseUsd: num(eg?.overageCostSupabaseUsd),
    },
    organizations: Array.isArray(raw?.organizations) ? raw!.organizations! : [],
    agents: Array.isArray(raw?.agents) ? raw!.agents! : [],
  };
}
