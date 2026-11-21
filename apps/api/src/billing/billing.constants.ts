/**
 * Planes y suscripciones — catálogos fijos (docs/suscripciones-y-planes-propuesta.md §10 y §11).
 * Los PLANES son datos de la base (editables por el superadmin); aquí solo viven las CLAVES que el código reconoce.
 */

/** Módulos = grupos del menú. El núcleo (dashboard, proyectos, papeles, hallazgos, administración básica) siempre está incluido. */
export const MODULE_KEYS = ['PLAN_ANUAL', 'CARTERA', 'HORAS', 'RIESGOS', 'GOBIERNO', 'SEGUIMIENTO_EXT', 'REPORTES_IA'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

/** Funciones caras o delicadas que se activan aparte. */
export const FUNCTION_KEYS = ['FIRMA', 'MARCA', 'FORENSE', 'CAATS_AVANZADOS'] as const;
export type FunctionKey = (typeof FUNCTION_KEYS)[number];

export type EntitlementKey = ModuleKey | FunctionKey;
export const ENTITLEMENT_KEYS: readonly EntitlementKey[] = [...MODULE_KEYS, ...FUNCTION_KEYS];

/** Los 15 asistentes de IA (agent_type del ai-service). */
export const ASSISTANT_KEYS = [
  'MINERVA', 'CASSANDRA', 'ARGUS', 'SCRIPTORIUM', 'SOCRATES', 'VULCANO', 'CICERO', 'SENADO', 'FISCUS', 'THEMIS',
  'HERMES', 'SHERLOCK', 'ATLAS', 'FENIX', 'MINERVA_QAIP',
] as const;
export type AssistantKey = (typeof ASSISTANT_KEYS)[number];

/** Tipos de archivo para las cuotas de espacio. */
export const FILE_TYPE_KEYS = ['VIDEO', 'AUDIO', 'PDF', 'FOTO', 'PPT', 'XLS', 'OTROS'] as const;
export type FileTypeKey = (typeof FILE_TYPE_KEYS)[number];

/** Roles que cuentan como «usuario de pago». No cuentan SUPER_ADMIN (plataforma) ni AUDITEE / READ_ONLY (invitados y clientes del portal). */
export const BILLABLE_ROLES: readonly string[] = ['ADMIN', 'CAE', 'AUDIT_MANAGER', 'SENIOR_AUDITOR', 'AUDITOR'];
export const isBillableRole = (role: string): boolean => BILLABLE_ROLES.includes(role);

/** Valores permitidos de duración de licencia en meses (0 = sin vencimiento). */
export const LICENSE_MONTHS = [0, 1, 3, 6, 12] as const;

/** Planes que nunca se bloquean (clientes actuales y cuentas de la plataforma). */
export const EXEMPT_PLAN_CODES: readonly string[] = ['PILOTO', 'INTERNO'];

/** Afinidad módulo/función → asistentes (misma regla que el editor de planes: pre-marca los afines). */
export function suggestAssistants(modules: readonly string[], functions: readonly string[]): AssistantKey[] {
  const on = (k: string) => modules.includes(k) || functions.includes(k);
  const rule: Record<AssistantKey, boolean> = {
    MINERVA: on('PLAN_ANUAL') || on('RIESGOS'), CASSANDRA: on('PLAN_ANUAL') || on('RIESGOS'),
    ARGUS: true, SCRIPTORIUM: true, SOCRATES: true, VULCANO: true,
    CICERO: on('REPORTES_IA'),
    SENADO: on('CARTERA') || on('GOBIERNO'), FISCUS: on('CARTERA') || on('GOBIERNO'), THEMIS: on('CARTERA') || on('GOBIERNO'),
    HERMES: on('FORENSE'), SHERLOCK: on('FORENSE'),
    ATLAS: on('GOBIERNO'), FENIX: on('GOBIERNO'), MINERVA_QAIP: on('GOBIERNO'),
  };
  return ASSISTANT_KEYS.filter((a) => rule[a]);
}
