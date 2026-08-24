/**
 * Puntaje ponderado del Sistema de Control Interno (COSO 2013) — port
 * server-side del algoritmo ya usado en el panel del papel PT-COSO
 * (`apps/web/src/components/working-papers/CosoScorePanel.tsx::computeComponent`).
 * Se duplica intencionalmente en vez de compartir un paquete: es matemática
 * pura (sin dependencias de React), y mantener el mismo criterio de
 * ponderación en ambos lados (25/25/20/15/15, riesgo 1-4, bandas 100-400) es
 * lo único que importa — cualquier cambio al modelo debe replicarse a mano en
 * los dos archivos, igual que ya documentado en `CosoScorePanel.tsx`.
 */

export interface CosoComponentMeta { sectionKey: string; label: string; short: string; weight: number }

export const COSO_COMPONENTS: CosoComponentMeta[] = [
  { sectionKey: 'S1', label: 'Entorno de Control',        short: 'Entorno',   weight: 25 },
  { sectionKey: 'S2', label: 'Evaluación de Riesgos',      short: 'Riesgos',   weight: 25 },
  { sectionKey: 'S3', label: 'Actividades de Control',     short: 'Controles', weight: 20 },
  { sectionKey: 'S4', label: 'Información y Comunicación', short: 'Info/Com.', weight: 15 },
  { sectionKey: 'S5', label: 'Actividades de Monitoreo',   short: 'Monitoreo', weight: 15 },
];

export interface CosoBand { min: number; max: number; label: string }

export const COSO_BANDS: CosoBand[] = [
  { min: 100, max: 175, label: 'Efectivo' },
  { min: 176, max: 250, label: 'Confiable' },
  { min: 251, max: 325, label: 'Poco Confiable' },
  { min: 326, max: 400, label: 'No Confiable' },
];

export function cosoBandFor(score: number): CosoBand {
  return COSO_BANDS.find(b => score >= b.min && score <= b.max) ?? COSO_BANDS[COSO_BANDS.length - 1];
}

const ACCENT_MAP: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n', ü: 'u' };
function normalize(s: string): string {
  return s.toLowerCase().split('').map(ch => ACCENT_MAP[ch] ?? ch).join('');
}
function findKey(row: Record<string, unknown>, patterns: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const p of patterns) {
    const found = keys.find(k => normalize(k).includes(p));
    if (found) return found;
  }
  return undefined;
}
function normAnswer(raw: unknown): 'si' | 'no' | 'na' | null {
  const n = normalize(String(raw ?? '')).replace(/[^a-z]/g, '');
  if (n === 'si') return 'si';
  if (n === 'no') return 'no';
  if (n === 'na') return 'na';
  return null;
}

export interface CosoPrincipleResult {
  principio: string; short: string;
  confidencePct: number | null; risk: number | null; answered: number; total: number;
}
export interface CosoComponentResult extends CosoComponentMeta {
  principles: CosoPrincipleResult[];
  avg: number | null;
  puntaje: number | null;
  confidencePct: number | null;
  answeredPrinciples: number;
  totalPrinciples: number;
}

/** `rows` = el `value` crudo (array) de la sección MATRIX S1..S5 de un PT-COSO. */
export function computeCosoComponent(rows: Record<string, unknown>[], meta: CosoComponentMeta): CosoComponentResult {
  const principioKey = rows.length > 0 ? findKey(rows[0], ['principio']) : undefined;
  const respuestaKey = rows.length > 0 ? findKey(rows[0], ['respuesta']) : undefined;

  const order: string[] = [];
  const byPrincipio = new Map<string, { si: number; no: number; total: number }>();
  for (const r of rows) {
    const principio = principioKey ? String(r[principioKey] ?? '').trim() : '';
    if (!principio) continue;
    if (!byPrincipio.has(principio)) { byPrincipio.set(principio, { si: 0, no: 0, total: 0 }); order.push(principio); }
    const stat = byPrincipio.get(principio)!;
    stat.total += 1;
    const ans = respuestaKey ? normAnswer(r[respuestaKey]) : null;
    if (ans === 'si') stat.si += 1;
    if (ans === 'no') stat.no += 1;
  }

  const principles: CosoPrincipleResult[] = order.map(principio => {
    const stat = byPrincipio.get(principio)!;
    const answered = stat.si + stat.no;
    const confidencePct = answered > 0 ? (stat.si / answered) * 100 : null;
    const risk = confidencePct !== null ? 4 - (confidencePct / 100) * 3 : null;
    const m = principio.match(/^(P\d+)/);
    return { principio, short: m ? m[1] : principio, confidencePct, risk, answered, total: stat.total };
  });

  const scored = principles.filter((p): p is CosoPrincipleResult & { risk: number } => p.risk !== null);
  const avg = scored.length > 0 ? scored.reduce((s, p) => s + p.risk, 0) / scored.length : null;
  const puntaje = avg !== null ? avg * meta.weight : null;
  const confidencePct = avg !== null ? ((4 - avg) / 3) * 100 : null;

  return {
    ...meta, principles, avg, puntaje, confidencePct,
    answeredPrinciples: scored.length, totalPrinciples: principles.length,
  };
}

export interface CosoAuditScore {
  auditId: string;
  totalScore: number | null;
  band: string | null;
  confidencePct: number | null;
  components: CosoComponentResult[];
  conclusionGlobal: string | null; // PT-COSO S6
  conclusionEnfoque: string | null; // PT-COSO S7
}

/** `sectionsByKey` = Map de sectionKey → value crudo de la sección, para UN audit/PT-COSO. */
export function computeCosoAuditScore(
  auditId: string,
  sectionsByKey: Map<string, unknown>,
): CosoAuditScore {
  const components = COSO_COMPONENTS.map(meta => {
    const raw = sectionsByKey.get(meta.sectionKey);
    const rows = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
    return computeCosoComponent(rows, meta);
  });
  const anyData = components.some(c => c.answeredPrinciples > 0);
  const totalScore = anyData ? components.reduce((s, c) => s + (c.puntaje ?? 0), 0) : null;
  const band = totalScore !== null ? cosoBandFor(totalScore).label : null;
  const confidencePct = totalScore !== null ? Math.min(100, Math.max(0, ((400 - totalScore) / 300) * 100)) : null;

  const s6 = sectionsByKey.get('S6');
  const s7 = sectionsByKey.get('S7');

  return {
    auditId,
    totalScore: totalScore !== null ? Math.round(totalScore * 10) / 10 : null,
    band,
    confidencePct: confidencePct !== null ? Math.round(confidencePct) : null,
    components,
    conclusionGlobal: typeof s6 === 'string' && s6 ? s6 : null,
    conclusionEnfoque: typeof s7 === 'string' && s7 ? s7 : null,
  };
}
