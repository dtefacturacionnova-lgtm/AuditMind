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
  // ── Auditoría Interna ──────────────────────────────────────────────────────
  { value: 'INTERNAL',              label: 'Interna Privada (NOGAI / IIA)' },
  { value: 'INTERNAL_GOVERNMENTAL', label: 'Interna Gubernamental (NAIG)' },
  // ── Auditoría Externa ─────────────────────────────────────────────────────
  { value: 'EXTERNAL',              label: 'Externa General (NIA)' },
  { value: 'EXTERNAL_FINANCIAL',    label: 'Externa Financiera El Salvador (CVPCPA)' },
  { value: 'FINANCIAL',             label: 'Financiera' },
  // ── Auditoría Operacional / Cumplimiento ──────────────────────────────────
  { value: 'OPERATIONAL',           label: 'Operacional' },
  { value: 'COMPLIANCE',            label: 'Cumplimiento' },
  // ── Auditoría Especializada TI ────────────────────────────────────────────
  { value: 'IT',                    label: 'TI General (COBIT / ITAF)' },
  { value: 'IT_SECURITY',           label: 'Seguridad de la Información (ISO 27001)' },
  { value: 'IT_SYSTEMS',            label: 'Sistemas de Información y BD (COBIT)' },
  { value: 'BCP_DRP',               label: 'BCP / DRP (Continuidad General)' },
  { value: 'BCP_CONTINUITY',        label: 'Continuidad del Negocio (ISO 22301)' },
  // ── Auditoría Especializada Regulatoria ───────────────────────────────────
  { value: 'AML',                   label: 'Prevención Lavado de Dinero (LCDA / NRP-36)' },
  { value: 'FORENSIC',              label: 'Forense / Examen Especial' },
  { value: 'ESG',                   label: 'ESG / Sostenibilidad' },
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
  INTERNAL_GOVERNMENTAL: [
    { value: 'EJECUCION_PRESUPUESTARIA', label: 'Ejecución Presupuestaria (Ley AFI)' },
    { value: 'COMPRAS_CONTRATACIONES',   label: 'Compras y Contrataciones (LACAP/UACI)' },
    { value: 'OBRAS_PUBLICAS',           label: 'Obras Públicas' },
    { value: 'NOMINA_PERSONAL',          label: 'Nómina y Personal' },
    { value: 'INVENTARIO_ACTIVOS',       label: 'Inventario de Activos' },
    { value: 'EXAMEN_ESPECIAL',          label: 'Examen Especial' },
  ],
  EXTERNAL: [
    { value: 'EEFF_COMPLETO',     label: 'EEFF Completo (NIA)' },
    { value: 'REVISION_LIMITADA', label: 'Revisión Limitada (NISR 2400)' },
    { value: 'DUE_DILIGENCE',     label: 'Due Diligence' },
    { value: 'COMPILACION',       label: 'Compilación (NISC 4410)' },
  ],
  EXTERNAL_FINANCIAL: [
    { value: 'EEFF_COMPLETO',       label: 'EEFF Completo — NIA 700 (CVPCPA)' },
    { value: 'REVISION_LIMITADA',   label: 'Revisión Limitada NISR 2400' },
    { value: 'COMPONENTE_GRUPO',    label: 'Componente de Grupo (NIA 600)' },
    { value: 'INSTITUCION_SSF',     label: 'Entidad Supervisada SSF/BCR' },
    { value: 'DUE_DILIGENCE',       label: 'Due Diligence Financiero' },
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
  IT_SECURITY: [
    { value: 'ISO_27001_CERT',  label: 'Certificación ISO 27001:2022' },
    { value: 'PENTEST',         label: 'Prueba de Penetración (Pentest)' },
    { value: 'SOC2',            label: 'SOC 2 Tipo II' },
    { value: 'NRP_23_32',       label: 'Cumplimiento NRP-23/NRP-32 (BCR/SSF)' },
    { value: 'DL_143_ACE',      label: 'Ley Ciberseguridad D.L. 143/2024' },
  ],
  IT_SYSTEMS: [
    { value: 'ERP_SAP',         label: 'SAP — Segregación de Funciones' },
    { value: 'ERP_ORACLE',      label: 'Oracle ERP — Accesos y Controles' },
    { value: 'BASES_DATOS',     label: 'Bases de Datos y Pistas de Auditoría' },
    { value: 'DL_144_DATOS',    label: 'Ley Datos Personales D.L. 144/2024' },
    { value: 'COBIT_GENERAL',   label: 'Evaluación COBIT 2019 General' },
  ],
  COMPLIANCE: [
    { value: 'SOX',       label: 'SOX / PCAOB' },
    { value: 'GDPR_LGPD', label: 'GDPR / LGPD' },
    { value: 'AML',       label: 'AML / LAFT' },
    { value: 'PCI_DSS',   label: 'PCI-DSS' },
    { value: 'ISO',       label: 'ISO 27001 / 22301' },
  ],
  BCP_DRP: [
    { value: 'BCP',    label: 'Plan de Continuidad de Negocio (BCP)' },
    { value: 'DRP',    label: 'Plan de Recuperación de Desastres (DRP)' },
    { value: 'CRISIS', label: 'Gestión de Crisis' },
  ],
  BCP_CONTINUITY: [
    { value: 'ISO_22301_CERT',  label: 'Certificación ISO 22301:2019' },
    { value: 'NRP_24',          label: 'Cumplimiento NRP-24 (BCR/SSF)' },
    { value: 'SIMULACRO',       label: 'Ejercicio / Simulacro (BCI GPG 7.0)' },
    { value: 'DRP',             label: 'Plan de Recuperación de Desastres' },
    { value: 'CRISIS',          label: 'Gestión de Crisis y Continuidad' },
  ],
  AML: [
    { value: 'ENTIDAD_BANCARIA',       label: 'Entidad Bancaria (NRP-36)' },
    { value: 'CASA_CAMBIO_REMESAS',    label: 'Casa de Cambio / Remesas' },
    { value: 'SUJETO_NO_FINANCIERO',   label: 'Sujeto Obligado No Financiero' },
    { value: 'EVALUACION_INTEGRAL',    label: 'Evaluación Integral Programa PLD' },
    { value: 'CRIPTOACTIVOS_CHIVO',    label: 'Criptoactivos / Billetera Chivo' },
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
  INTERNAL:              'bg-blue-100 text-blue-700',
  INTERNAL_GOVERNMENTAL: 'bg-indigo-100 text-indigo-700',
  EXTERNAL:              'bg-purple-100 text-purple-700',
  EXTERNAL_FINANCIAL:    'bg-violet-100 text-violet-700',
  FINANCIAL:             'bg-emerald-100 text-emerald-700',
  OPERATIONAL:           'bg-amber-100 text-amber-700',
  IT:                    'bg-cyan-100 text-cyan-700',
  IT_SECURITY:           'bg-red-100 text-red-700',
  IT_SYSTEMS:            'bg-teal-100 text-teal-700',
  COMPLIANCE:            'bg-rose-100 text-rose-700',
  ESG:                   'bg-green-100 text-green-700',
  FORENSIC:              'bg-red-100 text-red-700',
  BCP_DRP:               'bg-orange-100 text-orange-700',
  BCP_CONTINUITY:        'bg-orange-100 text-orange-700',
  AML:                   'bg-yellow-100 text-yellow-700',
};
