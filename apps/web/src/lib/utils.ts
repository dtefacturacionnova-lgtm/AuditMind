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
// El Universo clasifica con tipos funcionales; el Banco usa categorías institucionales/
// regulatorias. Este mapeo hereda el perfil de riesgo al promover una unidad auditável.
const RISK_TYPE_TO_CATEGORY: Record<string, string> = {
  FINANCIERO:   'CREDITO_FIDEICOMISO',   // riesgo financiero/crédito
  OPERACIONAL:  'OPERACIONAL',           // coincide directo
  TECNOLOGIA:   'OPERACIONAL',           // TI → riesgo operacional
  CUMPLIMIENTO: 'SEGUIMIENTO',           // control y seguimiento regulatorio
  FRAUDE:       'LAVADO_DINERO',         // fraude/antilavado
  ESTRATEGICO:  'INTEGRAL_GOBIERNO',     // gobierno corporativo y estrategia
  LEGAL:        'SEGUIMIENTO',           // riesgo legal → seguimiento
  ESG:          'AMBIENTAL_SOCIAL',      // ambiental, social y gobernanza
};

const VALID_RISK_CATEGORIES = new Set([
  'INTEGRAL_GOBIERNO', 'CREDITO_FIDEICOMISO', 'LIQUIDEZ_MERCADO',
  'LAVADO_DINERO', 'OPERACIONAL', 'AMBIENTAL_SOCIAL', 'SEGUIMIENTO', 'OTROS',
]);

/** Convierte el riskType del Universo al riskCategory más cercano del Banco de Proyectos */
export function mapRiskTypeToCategory(riskType: string | null | undefined): string {
  if (!riskType) return '';
  if (VALID_RISK_CATEGORIES.has(riskType)) return riskType; // ya es válido
  return RISK_TYPE_TO_CATEGORY[riskType] ?? 'OTROS';
}
