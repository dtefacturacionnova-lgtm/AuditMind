import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = 'CLP'): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(value);
}

/** Formatea montos monetarios con 2 decimales, sin atarse a una moneda/locale
 *  específica (la plataforma no modela "moneda de la organización" todavía).
 *  Los campos `Decimal` de Prisma llegan del backend serializados como string —
 *  por eso acepta string|number y siempre normaliza con `Number(...)`. */
export function formatMoney(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date): string {
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const diff = (new Date(date).getTime() - Date.now()) / 1000;
  const absDiff = Math.abs(diff);

  if (absDiff < 60) return rtf.format(Math.round(diff), 'seconds');
  if (absDiff < 3600) return rtf.format(Math.round(diff / 60), 'minutes');
  if (absDiff < 86400) return rtf.format(Math.round(diff / 3600), 'hours');
  return rtf.format(Math.round(diff / 86400), 'days');
}

export function truncate(str: string, length: number): string {
  return str.length > length ? `${str.slice(0, length)}…` : str;
}

// ─── Mapeo riskType (Universo) → riskCategory (Banco de Proyectos) ────────────
// El Universo clasifica con tipos funcionales; el Banco usa categorías institucionales.
const RISK_TYPE_TO_CATEGORY: Record<string, string> = {
  FINANCIERO:   'CREDITO_FIDEICOMISO',
  OPERACIONAL:  'OPERACIONAL',
  TECNOLOGIA:   'OPERACIONAL',
  CUMPLIMIENTO: 'SEGUIMIENTO',
  FRAUDE:       'LAVADO_DINERO',
  ESTRATEGICO:  'INTEGRAL_GOBIERNO',
  LEGAL:        'SEGUIMIENTO',
  ESG:          'AMBIENTAL_SOCIAL',
};

const VALID_RISK_CATEGORIES = new Set([
  'INTEGRAL_GOBIERNO', 'CREDITO_FIDEICOMISO', 'LIQUIDEZ_MERCADO',
  'LAVADO_DINERO', 'OPERACIONAL', 'AMBIENTAL_SOCIAL', 'SEGUIMIENTO', 'OTROS',
]);

/** Convierte el riskType del Universo al riskCategory del Banco de Proyectos */
export function mapRiskTypeToCategory(riskType: string | null | undefined): string {
  if (!riskType) return '';
  if (VALID_RISK_CATEGORIES.has(riskType)) return riskType;
  return RISK_TYPE_TO_CATEGORY[riskType] ?? 'OTROS';
}
