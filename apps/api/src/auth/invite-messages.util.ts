/**
 * Mensajes al invitar un correo que ya existe (2026-10-29). Un correo solo puede pertenecer a UNA organización, y la lista de usuarios solo muestra
 * la propia: quien invitaba a alguien de otra organización recibía «ya existe» sin poder verlo ni saber qué hacer. El nombre de la otra organización
 * solo se le dice al Super Admin (a un administrador común no se le revela a quién tienen otras organizaciones).
 */
export interface InviteConflict {
  email: string;
  /** El correo ya pertenece a la organización de quien invita. */
  sameOrganization: boolean;
  /** Nombre de la organización a la que pertenece hoy (solo se usa para el Super Admin). */
  organizationName?: string | null;
  viewerIsSuperAdmin: boolean;
}

export function inviteConflictMessage(i: InviteConflict): string {
  if (i.sameOrganization) {
    return `${i.email} ya pertenece a esta organización: búscalo en la lista de usuarios. Si su invitación quedó pendiente, usa «Reenviar invitación».`;
  }
  if (i.viewerIsSuperAdmin && i.organizationName) {
    return `${i.email} ya pertenece a la organización «${i.organizationName}». Un correo solo puede estar en una organización: gestiónalo desde esa organización o invita con otro correo.`;
  }
  return `${i.email} ya está registrado en otra organización. Un correo solo puede pertenecer a una organización: invita con otro correo o pídele al administrador de la otra organización que lo libere.`;
}

/** Texto del error de Supabase cuando pide esperar antes de mandar otro correo al mismo destinatario. */
export const isEmailRateLimit = (message: string): boolean => /rate limit|only request this after|too many|seconds/i.test(message);

/** Texto del error de Supabase cuando el correo ya está confirmado (ya aceptó la invitación). */
export const isAlreadyRegistered = (message: string): boolean => /already|registered|exists/i.test(message);
