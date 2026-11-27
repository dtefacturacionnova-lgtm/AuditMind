import type { NoticeText } from './billing-reminders';

/**
 * Avisos de uso al 80 % y al 100 % de las peticiones de IA y del espacio: lógica PURA (sin base de datos ni correo).
 *
 *   AI_80 / STORAGE_80   — «llevas el 80 %»: aviso para que compre o libere antes de llegar.
 *   AI_100 / STORAGE_100 — «llegaste al límite»: la IA se pausa o las subidas nuevas se bloquean (lo ya guardado sigue disponible).
 *
 * De cada recurso sale UN solo nivel: el más alto que se alcanzó.
 */

export type UsageAlertKind = 'AI_80' | 'AI_100' | 'STORAGE_80' | 'STORAGE_100';

export interface UsageAlertDecision {
  kind: UsageAlertKind;
  /** Porcentaje usado, entero (80 a 99 en «cerca»; 100 en «lleno»). */
  percent: number;
  /** IA: peticiones gastadas / capacidad. Espacio: bytes usados / bytes de capacidad. */
  used: number;
  capacity: number;
  /** IA: peticiones que quedan. Espacio: bytes libres. */
  remaining: number;
}

/** A partir de qué porcentaje se avisa «cerca del límite». */
export const NEAR_PERCENT = 80;

/** «NEAR» desde el 80 %, «FULL» al 100 %. Aritmética entera (sin coma flotante) para que 80 % justo cuente. */
export function usageLevel(used: number, capacity: number): 'NEAR' | 'FULL' | null {
  if (!(capacity > 0) || !(used >= 0)) return null;
  if (used >= capacity) return 'FULL';
  if (used * 100 >= capacity * NEAR_PERCENT) return 'NEAR';
  return null;
}

const wholePercent = (used: number, capacity: number): number => Math.min(99, Math.floor((used * 100) / capacity));

export interface AiUsageInput {
  /** Peticiones mensuales del plan; null = sin tope. */
  included: number | null;
  usedTotal: number;
  usedFromPlan: number;
  packRemaining: number;
  /** Lo que queda (plan + paquetes); null = sin tope. */
  available: number | null;
}

/**
 * IA: la capacidad del mes es lo incluido en el plan + los paquetes (lo ya gastado de paquetes + lo que queda de ellos). Se avisa «lleno» cuando
 * ya no queda nada disponible (justo cuando el servidor pausa la IA), no por el simple cociente.
 */
export function planAiAlert(s: AiUsageInput): UsageAlertDecision | null {
  if (s.included === null || s.available === null) return null;
  const capacity = s.included + Math.max(0, s.usedTotal - s.usedFromPlan) + Math.max(0, s.packRemaining);
  if (!(capacity > 0)) return null;
  const consumed = Math.max(0, capacity - s.available);
  if (s.available <= 0) return { kind: 'AI_100', percent: 100, used: capacity, capacity, remaining: 0 };
  if (usageLevel(consumed, capacity) === 'NEAR') {
    return { kind: 'AI_80', percent: wholePercent(consumed, capacity), used: consumed, capacity, remaining: s.available };
  }
  return null;
}

/** Espacio: bytes usados contra los bytes del plan + paquetes (null = sin tope). */
export function planStorageAlert(usedBytes: number, capacityBytes: number | null): UsageAlertDecision | null {
  if (capacityBytes === null) return null;
  const level = usageLevel(usedBytes, capacityBytes);
  if (level === 'FULL') return { kind: 'STORAGE_100', percent: 100, used: usedBytes, capacity: capacityBytes, remaining: 0 };
  if (level === 'NEAR') {
    return { kind: 'STORAGE_80', percent: wholePercent(usedBytes, capacityBytes), used: usedBytes, capacity: capacityBytes, remaining: capacityBytes - usedBytes };
  }
  return null;
}

// ── Texto del aviso ──

const GB = 1024 ** 3;
const num = (n: number) => Math.round(n).toLocaleString('en-US');
/** 3.5 GB, 12 GB, 0.4 GB: hasta un decimal, sin ceros de relleno. */
export const fmtGb = (bytes: number): string => `${(Math.round((bytes / GB) * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 })} GB`;

export interface UsageNoticeContext {
  orgName: string;
  planName: string;
}

export function describeUsageAlert(d: UsageAlertDecision, ctx: UsageNoticeContext): NoticeText {
  const planLine = `Plan: ${ctx.planName || 'sin nombre'} · Organización: ${ctx.orgName}.`;
  const extra = 'Puedes ampliar tu plan o comprar más; contacta al equipo de Nova Criterio.';

  if (d.kind === 'AI_80') {
    return {
      level: 'warning', notificationType: 'USAGE_AI_80',
      subject: `Llevas el ${d.percent} % de tus peticiones de IA de este mes`,
      heading: `Llevas el ${d.percent} % de tus peticiones de IA`,
      paragraphs: [
        `Este mes has usado ${num(d.used)} de ${num(d.capacity)} peticiones de IA y te quedan ${num(d.remaining)}. ${planLine}`,
        'Al llegar al límite los asistentes de IA se pausan hasta el próximo mes (cuando se renuevan las peticiones incluidas en tu plan) o hasta que compres más. Todo lo demás de la plataforma sigue funcionando.',
        extra,
      ],
      title: `Llevas el ${d.percent} % de tus peticiones de IA`,
      body: `Te quedan ${num(d.remaining)} peticiones este mes. Al agotarse, los asistentes se pausan.`,
    };
  }
  if (d.kind === 'AI_100') {
    return {
      level: 'critical', notificationType: 'USAGE_AI_100',
      subject: 'Llegaste al límite de peticiones de IA de este mes',
      heading: 'Llegaste al límite de peticiones de IA',
      paragraphs: [
        `Usaste las ${num(d.capacity)} peticiones de IA disponibles este mes. ${planLine}`,
        'Los asistentes de IA están en pausa: se reactivan al empezar el próximo mes (cuando se renuevan las peticiones incluidas en tu plan) o en cuanto compres más peticiones. Todo lo demás de la plataforma sigue funcionando y no se borra nada.',
        extra,
      ],
      title: 'Llegaste al límite de peticiones de IA',
      body: 'Los asistentes están en pausa hasta el próximo mes o hasta que compres más peticiones.',
    };
  }
  if (d.kind === 'STORAGE_80') {
    return {
      level: 'warning', notificationType: 'USAGE_STORAGE_80',
      subject: `Usaste el ${d.percent} % de tu espacio en Nova Criterio`,
      heading: `Usaste el ${d.percent} % de tu espacio`,
      paragraphs: [
        `Estás usando ${fmtGb(d.used)} de ${fmtGb(d.capacity)} y te quedan ${fmtGb(d.remaining)}. ${planLine}`,
        'Cuando se llene no podrás subir archivos nuevos; lo que ya guardaste sigue disponible y no se borra. Puedes liberar espacio descargando y archivando lo de auditorías cerradas.',
        extra,
      ],
      title: `Usaste el ${d.percent} % de tu espacio`,
      body: `Te quedan ${fmtGb(d.remaining)}. Al llenarse no podrás subir archivos nuevos.`,
    };
  }
  return {
    level: 'critical', notificationType: 'USAGE_STORAGE_100',
    subject: 'Tu espacio en Nova Criterio está lleno',
    heading: 'Tu espacio está lleno',
    paragraphs: [
      `Usaste los ${fmtGb(d.capacity)} de tu espacio. ${planLine}`,
      'No podrás subir archivos nuevos hasta liberar espacio o ampliarlo; lo que ya guardaste sigue disponible y no se borra. Puedes descargar y archivar lo de auditorías cerradas.',
      extra,
    ],
    title: 'Tu espacio está lleno',
    body: 'No podrás subir archivos nuevos hasta liberar espacio o comprar más. Lo guardado sigue disponible.',
  };
}
