import { PeriodKey, periodLabel } from './hours-close.util';

/**
 * Cálculos de calendario del cierre de horas, sin base de datos. Las fechas son AAAA-MM-DD en UTC, igual que workDate.
 * Un día es hábil si no es sábado ni domingo ni un festivo activo de la firma (mismo criterio que getAttendance).
 */

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function isBusinessDay(date: Date, holidays: Set<string>): boolean {
  const dow = date.getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.has(ymd(date));
}

/** Días hábiles (AAAA-MM-DD) del mes, en orden. */
export function businessDaysOf(p: PeriodKey, holidays: Set<string>): string[] {
  const out: string[] = [];
  const daysInMonth = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(Date.UTC(p.year, p.month - 1, day));
    if (isBusinessDay(d, holidays)) out.push(ymd(d));
  }
  return out;
}

/** El n-ésimo día hábil del mes (n ≥ 1). Si el mes no tiene tantos, el último. */
export function nthBusinessDay(p: PeriodKey, n: number, holidays: Set<string>): string {
  const days = businessDaysOf(p, holidays);
  return days[Math.min(Math.max(n, 1), days.length) - 1];
}

export function nextPeriod(p: PeriodKey): PeriodKey {
  return p.month === 12 ? { year: p.year + 1, month: 1 } : { year: p.year, month: p.month + 1 };
}
export function previousPeriod(p: PeriodKey): PeriodKey {
  return p.month === 1 ? { year: p.year - 1, month: 12 } : { year: p.year, month: p.month - 1 };
}

/** Hoy en El Salvador (AAAA-MM-DD): el servidor corre en UTC y de noche ya sería "mañana". */
export function todayInSalvador(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Un mes solo se cierra cuando terminó: su último día ya pasó. */
export function isPeriodFinished(p: PeriodKey, today: string): boolean {
  return today >= ymd(new Date(Date.UTC(p.year, p.month, 1)));
}

/** Clave de recordatorio 'AAAA-MM#etapa' y su orden: no se repite una etapa ya enviada ni una anterior. */
export const reminderKey = (p: PeriodKey, stage: 1 | 2) => `${periodLabel(p)}#${stage}`;
export const reminderAlreadySent = (last: string | null | undefined, key: string) => !!last && last >= key;
