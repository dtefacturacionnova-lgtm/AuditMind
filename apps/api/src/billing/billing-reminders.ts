import type { EffectiveStatus } from './entitlements';

/**
 * Avisos de vencimiento: lógica PURA (sin base de datos ni correo), para probarla sola.
 *
 *   EXPIRING  — «faltan N días»: una vez por cada día configurado en `reminderDays` (por defecto 7 y 1) y por cada fecha de vencimiento.
 *   GRACE     — «venció, tienes N días de gracia»: una sola vez por vencimiento.
 *   READ_ONLY — «pasó a solo lectura»: una sola vez por vencimiento.
 *
 * Cada aviso se identifica por (tipo, fecha de vencimiento[, día configurado]); al renovar cambia la fecha y los avisos vuelven a ser posibles.
 */

export type NoticeKind = 'EXPIRING' | 'GRACE' | 'READ_ONLY';

export interface NoticeDecision {
  kind: NoticeKind;
  /** Solo EXPIRING: el día configurado al que corresponde (7, 1…). El texto usa los días que realmente faltan, no este número. */
  days?: number;
}

export interface PlanNoticeInput {
  status: EffectiveStatus;
  exempt: boolean;
  endsAt: Date | null;
  /** Desde cuándo corre la prueba o el periodo vigente: no se avisa de inmediato a una suscripción recién creada. */
  periodStart: Date;
  now: Date;
  reminderDays: number[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Una suscripción con menos de este tiempo de vida no recibe aviso previo (una prueba corta recién creada no debe «avisar» al instante). */
export const MIN_AGE_FOR_EXPIRING_MS = DAY_MS;

/** Días que faltan hasta `to`, redondeando hacia arriba (queda 1 día aunque falten 3 horas). Nunca negativo. */
export function daysUntil(to: Date, now: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - now.getTime()) / DAY_MS));
}

/** Días configurados válidos: enteros ≥ 1, sin repetir, de menor a mayor. (El 0 no es un aviso previo: el día del vencimiento lo cubre «GRACE».) */
export function normalizeReminderDays(days: unknown): number[] {
  if (!Array.isArray(days)) return [];
  return [...new Set(days.filter((d): d is number => Number.isInteger(d) && d >= 1))].sort((a, b) => a - b);
}

/**
 * Qué aviso corresponde hoy a una suscripción (o null).
 * Si el servidor no corrió el día exacto, sale UN solo aviso: el más inmediato de los que ya tocan (nunca uno por cada día atrasado).
 */
export function planNotice(i: PlanNoticeInput): NoticeDecision | null {
  if (i.exempt || !i.endsAt) return null;
  if (i.status === 'GRACE') return { kind: 'GRACE' };
  if (i.status === 'READ_ONLY') return { kind: 'READ_ONLY' };
  if (i.status !== 'TRIAL' && i.status !== 'ACTIVE') return null; // SUSPENDED / CANCELLED: lo maneja el superadmin
  const msLeft = i.endsAt.getTime() - i.now.getTime();
  if (msLeft < 0) return null;
  const due = normalizeReminderDays(i.reminderDays).filter((d) => msLeft <= d * DAY_MS);
  if (due.length === 0) return null;
  if (i.now.getTime() - i.periodStart.getTime() < MIN_AGE_FOR_EXPIRING_MS) return null;
  return { kind: 'EXPIRING', days: due[0] };
}

// ── Texto del aviso ──

export interface NoticeContext {
  orgName: string;
  planName: string;
  /** Estado guardado: una prueba que termina dice «prueba», no «licencia». */
  storedStatus: string;
  endsAt: Date;
  graceEndsAt: Date | null;
  readOnlyEndsAt: Date | null;
  now: Date;
}

export interface NoticeText {
  /** Nivel para la notificación dentro de la aplicación. */
  level: 'warning' | 'critical';
  notificationType: string;
  subject: string;
  heading: string;
  /** Texto plano: el servicio de correo lo escapa; nunca se mete HTML aquí. */
  paragraphs: string[];
  /** Título y cuerpo cortos para la notificación dentro de la aplicación. */
  title: string;
  body: string;
}

const fmtDate = (d: Date) => new Intl.DateTimeFormat('es-SV', { timeZone: 'America/El_Salvador', dateStyle: 'long' }).format(d);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function describeNotice(decision: NoticeDecision, ctx: NoticeContext): NoticeText {
  const trial = ctx.storedStatus === 'TRIAL';
  const what = trial ? 'prueba' : 'licencia';
  const planLine = `Plan: ${ctx.planName || 'sin nombre'} · Organización: ${ctx.orgName}.`;
  const renew = 'Para renovar o ampliar tu plan, contacta al equipo de AuditMind. Nada de lo que guardaste se borra.';

  if (decision.kind === 'EXPIRING') {
    const left = daysUntil(ctx.endsAt, ctx.now);
    // «hoy» (faltan horas, ya en el día del vencimiento), «mañana» o «en N días».
    const timing = (verb: 'vence' | 'termina') => (left <= 0 ? `${verb} hoy` : left === 1 ? `${verb} mañana` : `${verb} en ${left} días`);
    const grace = ctx.graceEndsAt ? daysUntil(ctx.graceEndsAt, ctx.endsAt) : 0;
    const headline = trial ? `Tu prueba ${timing('termina')}` : `Tu licencia ${timing('vence')}`;
    return {
      level: 'warning',
      notificationType: 'SUBSCRIPTION_EXPIRING',
      subject: headline.replace(/^Tu (prueba|licencia)/, 'Tu $1 de AuditMind'),
      heading: headline,
      paragraphs: [
        `Tu ${what} termina el ${fmtDate(ctx.endsAt)}. ${planLine}`,
        grace > 0
          ? `Después tendrás ${plural(grace, 'día', 'días')} de gracia con todo habilitado y luego la cuenta pasará a solo lectura: podrás consultar y exportar, pero no crear ni editar.`
          : 'Después la cuenta pasará a solo lectura: podrás consultar y exportar, pero no crear ni editar.',
        renew,
      ],
      title: headline,
      body: `Termina el ${fmtDate(ctx.endsAt)}. Renueva para no pasar a solo lectura.`,
    };
  }

  if (decision.kind === 'GRACE') {
    const left = ctx.graceEndsAt ? daysUntil(ctx.graceEndsAt, ctx.now) : 0;
    const days = plural(Math.max(left, 1), 'día', 'días');
    const remaining = left <= 1 ? `te queda ${days}` : `te quedan ${days}`;
    return {
      level: 'warning',
      notificationType: 'SUBSCRIPTION_GRACE',
      subject: trial ? 'Tu prueba de AuditMind terminó' : 'Tu licencia de AuditMind venció',
      heading: trial ? 'Tu prueba terminó' : 'Tu licencia venció',
      paragraphs: [
        `Tu ${what} terminó el ${fmtDate(ctx.endsAt)}. ${planLine}`,
        `Estás en periodo de gracia: ${remaining} con todo habilitado. Al terminar, la cuenta pasará a solo lectura (consultar y exportar, sin crear ni editar).`,
        renew,
      ],
      title: trial ? 'Tu prueba terminó' : 'Tu licencia venció',
      body: `Estás en periodo de gracia: ${remaining}. Renueva para evitar el solo lectura.`,
    };
  }

  const until = ctx.readOnlyEndsAt ? fmtDate(ctx.readOnlyEndsAt) : null;
  return {
    level: 'critical',
    notificationType: 'SUBSCRIPTION_READ_ONLY',
    subject: 'Tu cuenta de AuditMind está en solo lectura',
    heading: 'Tu cuenta está en solo lectura',
    paragraphs: [
      `Tu ${what} terminó el ${fmtDate(ctx.endsAt)} y el periodo de gracia ya pasó. ${planLine}`,
      `Puedes consultar y exportar todo, pero no crear ni editar. ${until ? `Si no se renueva antes del ${until}, la cuenta se suspenderá (aun así, nada se borra).` : ''}`.trim(),
      renew,
    ],
    title: 'Tu cuenta está en solo lectura',
    body: 'Puedes consultar y exportar, pero no crear ni editar. Renueva para volver a la normalidad: no se borró nada.',
  };
}

/** ¿Hay que correr hoy? `BILLING_REMINDERS_ENABLED` manda; sin él, solo en producción (la base de pruebas locales ES la de producción). */
export function remindersEnabled(flag: string | undefined, nodeEnv: string | undefined): boolean {
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return nodeEnv === 'production';
}
