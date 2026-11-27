/**
 * Lógica pura de la vista del puente interina → final (sin React ni red). El cálculo vive en la API
 * (apps/api/src/audits/visits/visit-rules.ts → buildBridge); aquí solo se filtra, se rotula y se eligen los pasos a aceptar.
 */

export type BridgeReason = 'MOVIMIENTO_SOBRE_ME' | 'DESVIO_SOBRE_ESPERADO' | 'CUENTA_NUEVA_MATERIAL' | 'CUENTA_DESAPARECIDA_MATERIAL';
export type BridgePresence = 'AMBAS' | 'SOLO_INTERINA' | 'SOLO_FINAL';
export type BridgeNature = 'BALANCE' | 'RESULTADOS' | 'SIN_CLASIFICAR';

export interface BridgeRowView {
  code: string;
  name: string;
  nature: BridgeNature;
  presence: BridgePresence;
  interimBalance: number | null;
  finalBalance: number | null;
  movement: number;
  expectedFinal: number | null;
  deviation: number | null;
  deviationPct: number | null;
  alert: boolean;
  reason: BridgeReason | null;
  suggestedStep: string | null;
  /** El paso ROLLFORWARD que ya se creó para esta cuenta, si lo hay. */
  stepId: string | null;
}

export const REASON_LABEL: Record<BridgeReason, string> = {
  MOVIMIENTO_SOBRE_ME: 'Movimiento sobre la materialidad',
  DESVIO_SOBRE_ESPERADO: 'Desvío sobre lo esperado',
  CUENTA_NUEVA_MATERIAL: 'Cuenta nueva material',
  CUENTA_DESAPARECIDA_MATERIAL: 'Cuenta desaparecida material',
};

export const NATURE_LABEL: Record<BridgeNature, string> = { BALANCE: 'Balance', RESULTADOS: 'Resultados', SIN_CLASIFICAR: 'Sin clasificar' };

export type BridgeFilter = 'ALERTAS' | 'PENDIENTES' | 'TODAS' | 'SOLO_INTERINA' | 'SOLO_FINAL';

export const BRIDGE_FILTER_LABEL: Record<BridgeFilter, string> = {
  ALERTAS: 'Con alerta',
  PENDIENTES: 'Alerta sin paso',
  TODAS: 'Todas',
  SOLO_INTERINA: 'Solo en la interina',
  SOLO_FINAL: 'Solo en la final',
};

/** Filas que muestra cada filtro. «Alerta sin paso» son las que el auditor aún puede aceptar. */
export function filterBridgeRows(rows: BridgeRowView[], filter: BridgeFilter): BridgeRowView[] {
  switch (filter) {
    case 'ALERTAS': return rows.filter((r) => r.alert);
    case 'PENDIENTES': return rows.filter((r) => r.alert && r.stepId === null);
    case 'SOLO_INTERINA': return rows.filter((r) => r.presence === 'SOLO_INTERINA');
    case 'SOLO_FINAL': return rows.filter((r) => r.presence === 'SOLO_FINAL');
    default: return rows;
  }
}

/** Una cuenta se puede aceptar si tiene alerta, trae su paso sugerido y todavía no tiene paso creado. */
export function canAcceptStep(r: BridgeRowView): boolean {
  return r.alert && !!r.suggestedStep && r.stepId === null;
}

export function acceptableCodes(rows: BridgeRowView[]): string[] {
  return rows.filter(canAcceptStep).map((r) => r.code);
}

export interface StepTarget {
  sectionId: string;
  paperCode: string | null;
  paperTitle: string | null;
  sectionLabel: string;
  procedureCount: number;
}

/**
 * Dónde se proponen los pasos por defecto: la primera cuadrícula de un papel de pruebas sustantivas (código «C-…»); si no hay,
 * la primera que haya. El auditor puede elegir otra.
 */
export function defaultTarget(targets: StepTarget[]): StepTarget | null {
  if (targets.length === 0) return null;
  return targets.find((t) => /^C-/i.test(t.paperCode ?? '')) ?? targets[0];
}

/** Quita de la selección lo que ya no se puede aceptar (p. ej. porque alguien creó el paso mientras tanto). */
export function pruneSelection(selected: string[], rows: BridgeRowView[]): string[] {
  const ok = new Set(acceptableCodes(rows));
  return selected.filter((c) => ok.has(c));
}

export function toggleCode(selected: string[], code: string): string[] {
  return selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code];
}

/** Texto corto del resultado de aceptar pasos, con lo que se omitió y por qué. */
export function acceptSummary(r: { created: number; skipped: Array<{ code: string; reason: string }> }): string[] {
  const lines = [r.created === 0 ? 'No se creó ningún paso nuevo.' : `${r.created} paso${r.created === 1 ? '' : 's'} de período restante creado${r.created === 1 ? '' : 's'}.`];
  for (const s of r.skipped) lines.push(`${s.code}: ${s.reason}`);
  return lines;
}
