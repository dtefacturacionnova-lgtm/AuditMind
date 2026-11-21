/**
 * Planes y suscripciones — catálogos fijos del lado web. Las CLAVES son las mismas que reconoce el API
 * (apps/api/src/billing/billing.constants.ts); los textos son de interfaz. Si el API agrega una clave, se agrega aquí.
 */

export const MODULE_KEYS = ['PLAN_ANUAL', 'CARTERA', 'HORAS', 'RIESGOS', 'GOBIERNO', 'SEGUIMIENTO_EXT', 'REPORTES_IA'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const FUNCTION_KEYS = ['FIRMA', 'MARCA', 'FORENSE', 'CAATS_AVANZADOS'] as const;
export type FunctionKey = (typeof FUNCTION_KEYS)[number];

export type EntitlementKey = ModuleKey | FunctionKey;

export const ASSISTANT_KEYS = [
  'MINERVA', 'CASSANDRA', 'ARGUS', 'SCRIPTORIUM', 'SOCRATES', 'VULCANO', 'CICERO', 'SENADO', 'FISCUS', 'THEMIS',
  'HERMES', 'SHERLOCK', 'ATLAS', 'FENIX', 'MINERVA_QAIP',
] as const;
export type AssistantKey = (typeof ASSISTANT_KEYS)[number];

export const FILE_TYPE_KEYS = ['VIDEO', 'AUDIO', 'PDF', 'FOTO', 'PPT', 'XLS', 'OTROS'] as const;
export type FileTypeKey = (typeof FILE_TYPE_KEYS)[number];

/** Duración de la licencia en meses (0 = sin vencimiento). */
export const LICENSE_MONTHS = [1, 3, 6, 12, 0] as const;
export type LicenseMonths = (typeof LICENSE_MONTHS)[number];

export interface ModuleInfo {
  label: string;
  /** Nombre del grupo del menú (Sidebar). */
  menuLabel: string;
  description: string;
  /** Qué incluye, para la pantalla «no está en tu plan». */
  includes: string[];
  /** Primera pantalla del módulo (se usa en modo observación para «entrar de todos modos»). */
  entryHref: string;
}

export const MODULE_INFO: Record<ModuleKey, ModuleInfo> = {
  PLAN_ANUAL: {
    label: 'Planificación Anual (Auditoría Interna)', menuLabel: 'Planificación Anual',
    description: 'Plan estratégico, universo de auditoría, banco de proyectos y plan anual',
    includes: ['Plan estratégico y universo de auditoría', 'Banco de proyectos', 'Plan anual de auditoría'],
    entryHref: '/dashboard/strategic',
  },
  CARTERA: {
    label: 'Cartera de Auditoría Externa', menuLabel: 'Cartera',
    description: 'Cartera de clientes, propuestas, cartas de compromiso, encargos y cobranza',
    includes: ['Cartera y aceptación: prospectos, radar de aceptación y auditor predecesor', 'Propuestas, cartas de compromiso y encargos', 'Cobranza: facturas por cobrar, cobros recibidos y retenciones'],
    entryHref: '/dashboard/portfolio',
  },
  HORAS: {
    label: 'Horas y Rentabilidad', menuLabel: 'Horas y Rentabilidad',
    description: 'Captura y cierre de horas, utilización, rentabilidad, capacidad y costeo',
    includes: ['Captura y cierre de horas por persona y mes', 'Utilización, rentabilidad y capacidad del equipo', 'Costeo y tarifas'],
    entryHref: '/dashboard/timesheet',
  },
  RIESGOS: {
    label: 'Riesgos y Controles', menuLabel: 'Riesgos y Controles',
    description: 'Evaluación de riesgos y controles',
    includes: ['Evaluación de riesgos', 'Matriz y seguimiento de controles'],
    entryHref: '/dashboard/risks',
  },
  GOBIERNO: {
    label: 'Gobierno Corporativo', menuLabel: 'Gobierno',
    description: 'Comité de Auditoría, QAIP y Calidad, ESG, BCP/DRP',
    includes: ['Comité de Auditoría', 'QAIP y Calidad', 'ESG y BCP / DRP'],
    entryHref: '/dashboard/committee',
  },
  SEGUIMIENTO_EXT: {
    label: 'Portal PBC y Confirmaciones', menuLabel: 'Portal Auditado (PBC) y Confirmaciones Ext.',
    description: 'Portal del auditado (PBC) y confirmaciones externas NIA 505',
    includes: ['Portal del auditado (PBC) para pedir y recibir documentos', 'Confirmaciones externas NIA 505'],
    entryHref: '/dashboard/pbc',
  },
  REPORTES_IA: {
    label: 'Reportería e IA', menuLabel: 'Reportería e IA',
    description: 'Reportes, analytics, Notario PDF y página de asistentes',
    includes: ['Reportes y analytics', 'Notario PDF', 'Página de asistentes de IA'],
    entryHref: '/dashboard/reports',
  },
};

export interface FunctionInfo { label: string; description: string }

export const FUNCTION_INFO: Record<FunctionKey, FunctionInfo> = {
  FIRMA: { label: 'Firma electrónica por enlace', description: 'Cartas de compromiso, confirmaciones y actas' },
  MARCA: { label: 'Marca propia', description: 'Logo y colores en informes y portal' },
  FORENSE: { label: 'Investigador forense', description: 'SHERLOCK, grafo e informe de investigación' },
  CAATS_AVANZADOS: { label: 'CAATs avanzados y sanciones', description: 'Suite DTE, prueba GL horaria, OFAC / ONU / UK' },
};

/** Nombre corto de cada asistente (su especialidad). */
export const ASSISTANT_INFO: Record<AssistantKey, string> = {
  MINERVA: 'Planificación y Riesgos', CASSANDRA: 'Predicción de Riesgos', ARGUS: 'Controles Internos',
  SCRIPTORIUM: 'Documentación', SOCRATES: 'Entrevistas', VULCANO: 'Auditoría de TI', CICERO: 'Reportería',
  SENADO: 'Compliance', FISCUS: 'Auditoría Fiscal (NACOT)', THEMIS: 'Prevención de lavado (PLD/FT)',
  HERMES: 'Análisis Forense', SHERLOCK: 'Investigación Forense', ATLAS: 'ESG', FENIX: 'BCP / DRP', MINERVA_QAIP: 'QAIP y Calidad',
};

export const FILE_TYPE_INFO: Record<FileTypeKey, { label: string; note: string }> = {
  VIDEO: { label: 'Video', note: 'Lo que más espacio ocupa' },
  AUDIO: { label: 'Audio', note: 'Entrevistas y reuniones' },
  PDF: { label: 'PDF y documentos', note: 'Contratos, actas, informes' },
  FOTO: { label: 'Fotos', note: 'Evidencia de campo' },
  PPT: { label: 'Presentaciones', note: 'PowerPoint y similares' },
  XLS: { label: 'Excel y CSV', note: 'Bases de datos para CAATs' },
  OTROS: { label: 'Otros', note: 'Comprimidos y demás' },
};

export const LICENSE_LABEL: Record<number, string> = {
  1: 'Mensual', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual', 0: 'Sin vencimiento',
};

export const AUDIENCE_LABEL: Record<string, string> = { PERSONA: 'Persona', EMPRESA: 'Empresa' };

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'GRACE' | 'READ_ONLY' | 'SUSPENDED' | 'CANCELLED';

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  TRIAL: 'Prueba', ACTIVE: 'Activa', GRACE: 'Gracia', READ_ONLY: 'Solo lectura', SUSPENDED: 'Suspendida', CANCELLED: 'Cancelada',
};

/** Clases de Tailwind de la etiqueta de estado. */
export const STATUS_PILL: Record<SubscriptionStatus, string> = {
  TRIAL: 'bg-blue-100 text-blue-900',
  ACTIVE: 'bg-green-100 text-green-900',
  GRACE: 'bg-amber-100 text-amber-900',
  READ_ONLY: 'bg-red-100 text-red-900',
  SUSPENDED: 'bg-gray-200 text-gray-800',
  CANCELLED: 'bg-gray-200 text-gray-800',
};

export const isModuleKey = (k: unknown): k is ModuleKey => typeof k === 'string' && (MODULE_KEYS as readonly string[]).includes(k);
export const isFunctionKey = (k: unknown): k is FunctionKey => typeof k === 'string' && (FUNCTION_KEYS as readonly string[]).includes(k);
export const isEntitlementKey = (k: unknown): k is EntitlementKey => isModuleKey(k) || isFunctionKey(k);
export const isAssistantKey = (k: unknown): k is AssistantKey => typeof k === 'string' && (ASSISTANT_KEYS as readonly string[]).includes(k);
export const isFileTypeKey = (k: unknown): k is FileTypeKey => typeof k === 'string' && (FILE_TYPE_KEYS as readonly string[]).includes(k);
export const isStatus = (k: unknown): k is SubscriptionStatus => typeof k === 'string' && Object.prototype.hasOwnProperty.call(STATUS_LABEL, k);

/** Etiqueta de un módulo o función; para una clave desconocida del API devuelve un texto genérico (nunca la clave cruda como si fuera una frase). */
export function entitlementLabel(key: unknown): string {
  if (isModuleKey(key)) return MODULE_INFO[key].label;
  if (isFunctionKey(key)) return FUNCTION_INFO[key].label;
  return 'este módulo';
}

/**
 * Afinidad módulo/función → asistentes: pre-marca los afines a lo que el plan incluye.
 * Es la MISMA regla que `suggestAssistants` del API (apps/api/src/billing/billing.constants.ts); si una cambia, cambia la otra.
 */
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
