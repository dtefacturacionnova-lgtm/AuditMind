/**
 * Reglas puras del ciclo de vida de una visita y de las fechas que el usuario escribe. Sin base de datos.
 * Diseño: docs/visitas-auditoria-financiera-propuesta.md (§8).
 */
import { VISIT_KINDS, VisitKind } from './visit-rules';

export type VisitStatusName = 'PLANNED' | 'IN_PROGRESS' | 'CLOSED';

export const VISIT_KIND_LABEL: Record<VisitKind, string> = { PLANNING: 'de planificación', INTERIM: 'interina', FINAL: 'final' };

/** Tipos de encargo que usan visitas (auditoría financiera externa y sus variantes genéricas). */
export const VISIT_AUDIT_TYPES: readonly string[] = ['EXTERNAL_FINANCIAL', 'FINANCIAL', 'EXTERNAL'];

/**
 * Cambios de estado permitidos: planificada → en curso → cerrada. Se puede volver de «en curso» a «planificada» (se adelantó el inicio por
 * error) y reabrir una cerrada SOLO a «en curso»: no se «des-cierra» a planificada, porque borraría la huella de que ya se trabajó.
 * Mismo estado = sin cambio (permitido).
 */
const ALLOWED: Record<VisitStatusName, readonly VisitStatusName[]> = {
  PLANNED: ['PLANNED', 'IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['IN_PROGRESS', 'PLANNED', 'CLOSED'],
  CLOSED: ['CLOSED', 'IN_PROGRESS'],
};

export function canChangeVisitStatus(from: VisitStatusName, to: VisitStatusName): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

/** `AAAA-MM-DD` real (rechaza 2026-02-30). Devuelve la fecha a medianoche UTC o `null`. */
export function parseDateOnly(s: unknown): Date | null {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

export function isVisitKind(v: unknown): v is VisitKind {
  return typeof v === 'string' && (VISIT_KINDS as readonly string[]).includes(v);
}

/** Texto de la etiqueta del balance cuando quien carga no escribe uno. */
export function defaultPeriodLabel(kind: VisitKind, cutoff: Date): string {
  const dd = String(cutoff.getUTCDate()).padStart(2, '0');
  const mm = String(cutoff.getUTCMonth() + 1).padStart(2, '0');
  return `Visita ${VISIT_KIND_LABEL[kind]} al ${dd}/${mm}/${cutoff.getUTCFullYear()}`;
}

export interface BalanceWarningInput {
  accounts: Array<{ code: string; debit?: number; credit?: number }>;
  totalDebit: number;
  totalCredit: number;
}

/** Avisos al cargar un balance (no lo bloquean: el auditor decide). */
export function balanceWarnings(i: BalanceWarningInput): string[] {
  const out: string[] = [];
  const diff = Math.round((i.totalDebit - i.totalCredit) * 100) / 100;
  if (Math.abs(diff) >= 0.01) out.push(`El balance no cuadra: débitos y créditos difieren en ${Math.abs(diff).toFixed(2)}.`);
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const a of i.accounts) {
    const c = String(a.code).trim();
    if (seen.has(c)) dup.add(c);
    seen.add(c);
  }
  if (dup.size > 0) {
    const lista = [...dup].slice(0, 5).join(', ');
    out.push(`Hay ${dup.size} código(s) de cuenta repetido(s) (${lista}${dup.size > 5 ? '…' : ''}); al comparar se suman sus saldos.`);
  }
  return out;
}
