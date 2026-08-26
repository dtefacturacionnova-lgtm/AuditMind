import { UserRole, ROLE_LEVEL } from './enums';

export const ROLE_LEVELS = ROLE_LEVEL;

export function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[requiredRole];
}

export const MATERIALITY_DEFAULTS = {
  EXECUTION_PERCENTAGE: 0.75,   // ME = 75% of MG
  ACCUMULATION_PERCENTAGE: 0.50, // UAE = 50% of MG
} as const;

export const AUDIT_RISK_TARGET = 0.05; // NIA 200: AR = RI × RC × RD = 5%

export const WORKING_PAPER_INDEX_LABELS: Record<string, string> = {
  A: 'Planificación',
  B: 'Evaluación de Controles',
  C: 'Pruebas Sustantivas',
  D: 'Hallazgos',
  E: 'Cierre',
  AD: 'Análisis de Datos',
};

export const TICK_MARK_SYMBOLS: Record<string, string> = {
  VERIFIED: '✓',
  EXCEPTION: '✗',
  ESTIMATED: 'E',
  CONFIRMED_THIRD: 'CT',
  RECALCULATED: 'R',
  FOOTED: 'F',
  CROSS_FOOTED: 'CF',
  NOT_APPLICABLE: 'N/A',
  PENDING: '?',
  ATTENTION: '!',
};

export const AI_AGENT_DESCRIPTIONS: Record<string, string> = {
  MINERVA: 'Planificación inteligente y evaluación de riesgos',
  SCRIPTORIUM: 'Generación de papeles de trabajo y documentación',
  ARGUS: 'Evaluación de controles y testing',
  HERMES: 'Gestión de solicitudes PBC y comunicaciones',
  CICERO: 'Redacción de informes y recomendaciones',
  SOCRATES: 'Análisis de datos y detección de anomalías',
  CASSANDRA: 'Predicción de riesgos y alertas tempranas',
  VULCANO: 'Auditoría de TI y ciberseguridad',
  SENADO: 'Informes para Comité de Auditoría',
  ATLAS: 'ESG y sostenibilidad',
  FENIX: 'BCP/DRP y continuidad de negocio',
  FISCUS: 'Auditoría fiscal y tributaria (NACOT)',
  SHERLOCK: 'Modo investigación forense',
  MINERVA_QAIP: 'QAIP y mejora continua de la auditoría',
};

export const DEFAULT_PAGINATION = {
  PAGE: 1,
  LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

export const PORTAL_TOKEN_EXPIRY_DAYS = 30;

export const MAX_FILE_SIZE_MB = 50;
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/plain',
];
