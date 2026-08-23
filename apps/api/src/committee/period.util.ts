// ─── Utilidades de período para el Comité de Auditoría ───────────────────────
// Único lugar del repo que sabe convertir una fecha ↔ una clave de período
// (trimestre/semestre/mes/año) — antes de esto cada pantalla reimplementaba
// su propio getQuarter() local (ver plans/[id]/page.tsx).

export type PeriodType = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fecha → clave de período. Ej: 2026-08-22 + QUARTERLY → "2026-Q3". */
export function getPeriodKey(date: Date, type: PeriodType): string {
  const y = date.getFullYear();
  switch (type) {
    case 'MONTHLY':
      return `${y}-${pad2(date.getMonth() + 1)}`;
    case 'QUARTERLY':
      return `${y}-Q${Math.floor(date.getMonth() / 3) + 1}`;
    case 'SEMIANNUAL':
      return `${y}-H${date.getMonth() < 6 ? 1 : 2}`;
    case 'ANNUAL':
      return `${y}`;
  }
}

/** Clave de período → año calendario al que pertenece. */
export function getPeriodYear(key: string, type: PeriodType): number {
  if (type === 'ANNUAL') return Number(key);
  return Number(key.split('-')[0]);
}

/** Clave de período → rango [inicio, fin] cubierto (fin inclusivo, 23:59:59.999). */
export function getPeriodRange(key: string, type: PeriodType): { start: Date; end: Date } {
  if (type === 'MONTHLY') {
    const [y, m] = key.split('-').map(Number);
    return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59, 999) };
  }
  if (type === 'QUARTERLY') {
    const [yStr, qStr] = key.split('-Q');
    const y = Number(yStr);
    const q = Number(qStr);
    const startMonth = (q - 1) * 3;
    return { start: new Date(y, startMonth, 1), end: new Date(y, startMonth + 3, 0, 23, 59, 59, 999) };
  }
  if (type === 'SEMIANNUAL') {
    const [yStr, hStr] = key.split('-H');
    const y = Number(yStr);
    const startMonth = Number(hStr) === 1 ? 0 : 6;
    return { start: new Date(y, startMonth, 1), end: new Date(y, startMonth + 6, 0, 23, 59, 59, 999) };
  }
  const y = Number(key);
  return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59, 999) };
}

/** Etiqueta legible en español para mostrar en el selector de período. */
export function getPeriodLabel(key: string, type: PeriodType): string {
  if (type === 'QUARTERLY') {
    const [y, q] = key.split('-Q');
    const ranges: Record<string, string> = { '1': 'ene–mar', '2': 'abr–jun', '3': 'jul–sep', '4': 'oct–dic' };
    return `Q${q} ${y} (${ranges[q]})`;
  }
  if (type === 'MONTHLY') {
    const [y, m] = key.split('-');
    const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${names[Number(m) - 1]} ${y}`;
  }
  if (type === 'SEMIANNUAL') {
    const [y, h] = key.split('-H');
    return `S${h} ${y} (${h === '1' ? 'ene–jun' : 'jul–dic'})`;
  }
  return key;
}

/** Desplaza una clave de período `delta` unidades (negativo = hacia atrás). */
export function shiftPeriod(key: string, type: PeriodType, delta: number): string {
  const { start } = getPeriodRange(key, type);
  const d = new Date(start);
  if (type === 'MONTHLY') d.setMonth(d.getMonth() + delta);
  else if (type === 'QUARTERLY') d.setMonth(d.getMonth() + delta * 3);
  else if (type === 'SEMIANNUAL') d.setMonth(d.getMonth() + delta * 6);
  else d.setFullYear(d.getFullYear() + delta);
  return getPeriodKey(d, type);
}

/** Últimas `n` claves de período terminando en `currentKey` (incluida). */
export function lastNPeriods(currentKey: string, type: PeriodType, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftPeriod(currentKey, type, -i));
  return out;
}

export function isPeriodType(v: unknown): v is PeriodType {
  return v === 'MONTHLY' || v === 'QUARTERLY' || v === 'SEMIANNUAL' || v === 'ANNUAL';
}
