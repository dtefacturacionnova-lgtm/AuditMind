/**
 * Catálogo de tipos y sub-tipos de auditoría.
 * Fuente de verdad para el formulario de creación y los filtros del listado.
 */

export interface AuditTypeOption {
  value: string;
  label: string;
}

export interface AuditSubtypeOption {
  value: string;
  label: string;
}

// ─── Tipos principales (mapea 1:1 con AuditType enum de Prisma) ───────────────

export const AUDIT_TYPES: AuditTypeOption[] = [
  { value: 'INTERNAL',    label: 'Auditoría Interna' },
  { value: 'EXTERNAL',    label: 'Auditoría Externa' },
  { value: 'FINANCIAL',   label: 'Financiera' },
  { value: 'OPERATIONAL', label: 'Operacional' },
  { value: 'IT',          label: 'Tecnologías de Información' },
  { value: 'COMPLIANCE',  label: 'Cumplimiento' },
  { value: 'ESG',         label: 'ESG / Sostenibilidad' },
  { value: 'FORENSIC',    label: 'Forense' },
  { value: 'BCP_DRP',     label: 'BCP / DRP' },
];

// ─── Sub-tipos por tipo principal ─────────────────────────────────────────────

export const AUDIT_SUBTYPES: Record<string, AuditSubtypeOption[]> = {
  INTERNAL: [
    { value: 'PROCESO',      label: 'Proceso' },
    { value: 'FINANCIERO',   label: 'Financiero' },
    { value: 'SISTEMAS',     label: 'Sistemas / TI' },
    { value: 'CUMPLIMIENTO', label: 'Cumplimiento' },
    { value: 'GESTION',      label: 'Gestión' },
    { value: 'FRAUDE',       label: 'Fraude / Investigación Interna' },
  ],
  EXTERNAL: [
    { value: 'EEFF_COMPLETO',     label: 'EEFF Completo (NIA)' },
    { value: 'REVISION_LIMITADA', label: 'Revisión Limitada (NISR 2400)' },
    { value: 'DUE_DILIGENCE',     label: 'Due Diligence' },
    { value: 'COMPILACION',       label: 'Compilación (NISC 4410)' },
  ],
  FINANCIAL: [
    { value: 'BALANCE_GENERAL',    label: 'Balance General' },
    { value: 'ESTADO_RESULTADOS',  label: 'Estado de Resultados' },
    { value: 'FLUJO_CAJA',         label: 'Flujo de Caja' },
    { value: 'CUENTAS_ESPECIFICAS',label: 'Cuentas Específicas' },
  ],
  OPERATIONAL: [
    { value: 'COMPRAS',   label: 'Ciclo de Compras' },
    { value: 'VENTAS',    label: 'Ciclo de Ventas' },
    { value: 'RRHH',      label: 'Recursos Humanos' },
    { value: 'PRODUCCION',label: 'Producción / Operaciones' },
    { value: 'LOGISTICA', label: 'Logística / Cadena de Suministro' },
  ],
  IT: [
    { value: 'SEGURIDAD',       label: 'Seguridad de la Información' },
    { value: 'APLICACIONES',    label: 'Auditoría de Aplicaciones' },
    { value: 'INFRAESTRUCTURA', label: 'Infraestructura' },
    { value: 'SDLC',            label: 'Ciclo de Vida del Software (SDLC)' },
    { value: 'DATA',            label: 'Gobierno de Datos' },
  ],
  COMPLIANCE: [
    { value: 'SOX',       label: 'SOX / PCAOB' },
    { value: 'GDPR_LGPD', label: 'GDPR / LGPD' },
    { value: 'AML',       label: 'AML / LAFT' },
    { value: 'PCI_DSS',   label: 'PCI-DSS' },
    { value: 'ISO',       label: 'ISO 27001 / 22301' },
  ],
  ESG: [
    { value: 'AMBIENTAL',   label: 'Ambiental' },
    { value: 'SOCIAL',      label: 'Social / Derechos Humanos' },
    { value: 'GOBERNANZA',  label: 'Gobernanza Corporativa' },
    { value: 'CARBONO',     label: 'Huella de Carbono / Net Zero' },
  ],
  FORENSIC: [
    { value: 'FRAUDE_CONTABLE', label: 'Fraude Contable' },
    { value: 'CORRUPCION',      label: 'Corrupción / Soborno' },
    { value: 'LAVADO',          label: 'Lavado de Activos' },
    { value: 'CIBERCRIMEN',     label: 'Cibercrimen' },
    { value: 'LITIGIO',         label: 'Apoyo a Litigio' },
  ],
  BCP_DRP: [
    { value: 'BCP',    label: 'Plan de Continuidad de Negocio (BCP)' },
    { value: 'DRP',    label: 'Plan de Recuperación de Desastres (DRP)' },
    { value: 'CRISIS', label: 'Gestión de Crisis' },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getTypeLabel(type: string): string {
  return AUDIT_TYPES.find(t => t.value === type)?.label ?? type;
}

export function getSubtypeLabel(type: string, subtype: string): string {
  return AUDIT_SUBTYPES[type]?.find(s => s.value === subtype)?.label ?? subtype;
}

// ─── Badge colors por tipo ────────────────────────────────────────────────────

export const TYPE_BADGE: Record<string, string> = {
  INTERNAL:    'bg-blue-100 text-blue-700',
  EXTERNAL:    'bg-purple-100 text-purple-700',
  FINANCIAL:   'bg-emerald-100 text-emerald-700',
  OPERATIONAL: 'bg-amber-100 text-amber-700',
  IT:          'bg-cyan-100 text-cyan-700',
  COMPLIANCE:  'bg-rose-100 text-rose-700',
  ESG:         'bg-green-100 text-green-700',
  FORENSIC:    'bg-red-100 text-red-700',
  BCP_DRP:     'bg-orange-100 text-orange-700',
};
