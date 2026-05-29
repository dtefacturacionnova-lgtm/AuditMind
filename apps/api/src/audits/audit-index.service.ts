import { Injectable, Logger } from '@nestjs/common';
import { AuditType, WpKind, WorkingPaperType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PAPER_TEMPLATES } from '../working-papers/paper-templates';

// ─── Paper definition within an index ────────────────────────────────────────

interface PaperDef {
  code:         string;           // A-01, B-00, etc.
  indexSection: string;           // A | B | C | D | E
  title:        string;
  type:         WorkingPaperType;
  wpKind:       WpKind;
  paperCode?:   string;           // template key → auto-init sections
}

// ─── Index definitions ────────────────────────────────────────────────────────

/**
 * INDICE-01 — Auditoría Interna Privada (NOGAI / IIA 2025)
 * Applies to: INTERNAL | OPERATIONAL | IT | COMPLIANCE | ESG | BCP_DRP
 */
const INDEX_INTERNAL: PaperDef[] = [
  {
    code: 'A-01', indexSection: 'A',
    title:    'Orden de Trabajo / Notificación de Inicio',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'A-02', indexSection: 'A',
    title:    'Entendimiento del Negocio y Entorno',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A1',
  },
  {
    code: 'A-03', indexSection: 'A',
    title:    'Evaluación de Riesgo Inherente (RI) por Área',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A2',
  },
  {
    code: 'A-04', indexSection: 'A',
    title:    'Evaluación de Controles y Riesgo de Control (RC)',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A3',
  },
  {
    code: 'A-05', indexSection: 'A',
    title:    'Cálculo de Materialidad',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A4',
  },
  {
    code: 'A-06', indexSection: 'A',
    title:    'Evaluación de Riesgos COSO 2013 — Sistema de Control Interno',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-COSO',
  },
  {
    code: 'A-07', indexSection: 'A',
    title:    'Memorando de Planificación',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-MEMO',
  },
  {
    code: 'A-08', indexSection: 'A',
    title:    'Programa de Auditoría',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-PROG',
  },
];

/**
 * INDICE-03 — Auditoría Externa de Estados Financieros (NIA / ISA)
 * Applies to: EXTERNAL | FINANCIAL
 */
const INDEX_EXTERNAL: PaperDef[] = [
  {
    code: 'A-01', indexSection: 'A',
    title:    'Carta de Encargo / Términos del Trabajo (NIA 210)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'A-02', indexSection: 'A',
    title:    'Entendimiento del Negocio y Entorno (NIA 315)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A1',
  },
  {
    code: 'A-03', indexSection: 'A',
    title:    'Identificación y Evaluación de Riesgos de Error Material (NIA 315)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A2',
  },
  {
    code: 'A-04', indexSection: 'A',
    title:    'Evaluación del Control Interno sobre RF (NIA 315.25)',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A3',
  },
  {
    code: 'A-05', indexSection: 'A',
    title:    'Cálculo de Materialidad (NIA 320)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A4',
  },
  {
    code: 'A-06', indexSection: 'A',
    title:    'Evaluación COSO 2013 — Control Interno sobre Información Financiera',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-COSO',
  },
  {
    code: 'A-07', indexSection: 'A',
    title:    'Memorando de Planificación',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-MEMO',
  },
  {
    code: 'A-08', indexSection: 'A',
    title:    'Programa de Auditoría por Sección',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-PROG',
  },
  // ─── Sección B — EEFF y Sumarias ─────────────────────────────────────────
  {
    code: 'B-00', indexSection: 'B',
    title:    'Estados Financieros del Cliente — Cédula Madre (EEFF)',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-EEFF',
  },
  {
    code: 'B-06', indexSection: 'B',
    title:    'Cédula de Diferencias y Ajustes vs. Materialidad',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-DIFS',
  },
];

/**
 * INDICE-04 — Examen Especial / Auditoría Forense (ACFE + NIA 240)
 * Applies to: FORENSIC
 */
const INDEX_FORENSIC: PaperDef[] = [
  {
    code: 'A-01', indexSection: 'A',
    title:    'Instrucción / Orden de Investigación Especial',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'A-02', indexSection: 'A',
    title:    'Entendimiento del Negocio y Contexto Forense',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A1',
  },
  {
    code: 'A-03', indexSection: 'A',
    title:    'Evaluación de Riesgo de Fraude — Triángulo ACFE (NIA 240)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A2',
  },
  {
    code: 'A-04', indexSection: 'A',
    title:    'Cadena de Custodia y Registro de Evidencia Digital',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'A-05', indexSection: 'A',
    title:    'Programa de Investigación Especial',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-PROG',
  },
];

/**
 * INDICE-05 — Auditoría Interna Gubernamental El Salvador (NAIG Decreto 7/2016)
 * Applies to: INTERNAL_GOVERNMENTAL
 */
const INDEX_GOVERNMENTAL: PaperDef[] = [
  // ─── Sección ACA — Antecedentes y Conocimiento ─────────────────────────────
  {
    code: 'ACA-01', indexSection: 'ACA',
    title:    'Comisión / Designación del Auditor Gubernamental (NAIG Art. 8-9)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'ACA-02', indexSection: 'ACA',
    title:    'Entendimiento del Ente Gubernamental — Marco Legal y Presupuestario',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A1',
  },
  {
    code: 'ACA-03', indexSection: 'ACA',
    title:    'Evaluación del SIAFI y Sistemas de Información Gubernamental',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.STANDARD,
  },
  // ─── Sección PL — Planificación ──────────────────────────────────────────────
  {
    code: 'PL-01', indexSection: 'PL',
    title:    'Evaluación de Riesgo Gubernamental (NAIG Art. 14)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A2',
  },
  {
    code: 'PL-02', indexSection: 'PL',
    title:    'Evaluación del SCI Gubernamental — COSO 2013 (NAIG Art. 15)',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-COSO',
  },
  {
    code: 'PL-03', indexSection: 'PL',
    title:    'Determinación de Materialidad Pública (Base: Presupuesto Asignado)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A4',
  },
  {
    code: 'PL-04', indexSection: 'PL',
    title:    'Memorando de Planificación Gubernamental (NAIG Cap. V)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-MEMO',
  },
  {
    code: 'PL-05', indexSection: 'PL',
    title:    'Programa de Auditoría Gubernamental',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-PROG',
  },
  // ─── Sección EJ — Ejecución ───────────────────────────────────────────────────
  {
    code: 'EJ-01', indexSection: 'EJ',
    title:    'Pruebas de Ejecución Presupuestaria y Tesorería (Ley AFI)',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'EJ-02', indexSection: 'EJ',
    title:    'Revisión de Compras y Contrataciones — LACAP / UACI',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'EJ-03', indexSection: 'EJ',
    title:    'Revisión de Planillas, Remuneraciones y Beneficios',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  // ─── Sección COM — Comunicación de Hallazgos ─────────────────────────────────
  {
    code: 'COM-01', indexSection: 'COM',
    title:    'Hoja de Hallazgo Gubernamental — 5 Elementos NAIG',
    type:     WorkingPaperType.FINDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-GOV-HAL',
  },
  // ─── Sección INF — Informe ────────────────────────────────────────────────────
  {
    code: 'INF-01', indexSection: 'INF',
    title:    'Informe de Auditoría Gubernamental (NAIG Cap. VIII)',
    type:     WorkingPaperType.CLOSURE_CONCLUSION,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-MEMO',
  },
  // ─── Sección SEG — Seguimiento ────────────────────────────────────────────────
  {
    code: 'SEG-01', indexSection: 'SEG',
    title:    'Seguimiento de Recomendaciones y Compromisos (NAIG Art. 37)',
    type:     WorkingPaperType.CLOSURE_CONCLUSION,
    wpKind:   WpKind.STANDARD,
  },
];

/**
 * INDICE-06 — Auditoría Externa Financiera El Salvador (CVPCPA Res. 129/2022 + NIA)
 * Applies to: EXTERNAL_FINANCIAL
 */
const INDEX_EXTERNAL_FINANCIAL: PaperDef[] = [
  // ─── Sección A — Planificación ───────────────────────────────────────────────
  {
    code: 'A-01', indexSection: 'A',
    title:    'Carta de Encargo + Declaración de Independencia (NIA 210 / CVPCPA)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'A-02', indexSection: 'A',
    title:    'Entendimiento del Negocio y Entorno (NIA 315)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A1',
  },
  {
    code: 'A-03', indexSection: 'A',
    title:    'Identificación y Evaluación de Riesgos de Error Material (NIA 315)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A2',
  },
  {
    code: 'A-04', indexSection: 'A',
    title:    'Evaluación del Control Interno sobre Información Financiera (NIA 315.25)',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A3',
  },
  {
    code: 'A-05', indexSection: 'A',
    title:    'Cálculo de Materialidad (NIA 320)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A4',
  },
  {
    code: 'A-06', indexSection: 'A',
    title:    'Evaluación COSO 2013 — Control Interno sobre Información Financiera',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-COSO',
  },
  {
    code: 'A-07', indexSection: 'A',
    title:    'Memorando de Planificación (NIA 300)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-MEMO',
  },
  {
    code: 'A-08', indexSection: 'A',
    title:    'Programa de Auditoría por Sección (NIA 300)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-PROG',
  },
  // ─── Sección B — Estados Financieros y Cédulas Sumarias ──────────────────────
  {
    code: 'B-00', indexSection: 'B',
    title:    'Estados Financieros del Cliente — Cédula Madre (EEFF)',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-EEFF',
  },
  {
    code: 'B-01', indexSection: 'B',
    title:    'Sumaria Activos Corrientes',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-02', indexSection: 'B',
    title:    'Sumaria Activos No Corrientes',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-03', indexSection: 'B',
    title:    'Sumaria Pasivos',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-04', indexSection: 'B',
    title:    'Sumaria Patrimonio',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-05', indexSection: 'B',
    title:    'Sumaria Estado de Resultados',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-06', indexSection: 'B',
    title:    'Cédula de Diferencias y Ajustes vs. Materialidad',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-DIFS',
  },
  // ─── Sección C — Pruebas de Detalle ──────────────────────────────────────────
  {
    code: 'C-01', indexSection: 'C',
    title:    'Confirmaciones Bancarias y Arqueo de Caja (NIA 505)',
    type:     WorkingPaperType.CONFIRMATION,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'C-02', indexSection: 'C',
    title:    'Confirmaciones de Saldos — Cuentas por Cobrar (NIA 505)',
    type:     WorkingPaperType.CONFIRMATION,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'C-03', indexSection: 'C',
    title:    'Pruebas de Inventarios — Conteo Físico (NIA 501)',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  // ─── Sección D — Conclusión e Informe ────────────────────────────────────────
  {
    code: 'D-01', indexSection: 'D',
    title:    'Síntesis de Conclusiones y Determinación de Opinión (NIA 700/705)',
    type:     WorkingPaperType.CLOSURE_CONCLUSION,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-DIFS',
  },
  {
    code: 'D-02', indexSection: 'D',
    title:    'Carta de Representación de Gerencia (NIA 580)',
    type:     WorkingPaperType.CLOSURE_CONCLUSION,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'D-03', indexSection: 'D',
    title:    'Informe del Auditor Independiente — Formato CVPCPA (Res. 129/2022)',
    type:     WorkingPaperType.CLOSURE_CONCLUSION,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-MEMO',
  },
];

/**
 * INDICE-07 — Auditoría de Seguridad de la Información (ISO 27001:2022 + NRP-23/32)
 * Applies to: IT_SECURITY
 */
const INDEX_IT_SECURITY: PaperDef[] = [
  {
    code: 'A-01', indexSection: 'A',
    title:    'Alcance del SGSI y Términos del Trabajo (ISO 27001 cl. 4-6)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'A-02', indexSection: 'A',
    title:    'Entendimiento del Entorno TI y Clasificación de Activos',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A1',
  },
  {
    code: 'A-03', indexSection: 'A',
    title:    'Evaluación de Riesgos de Seguridad (ISO 27001 cl. 6.1 / NRP-23)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-SEC-RISK',
  },
  {
    code: 'A-04', indexSection: 'A',
    title:    'Evaluación de Controles — Tecnológicos, Organizacionales y Personas',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A3',
  },
  {
    code: 'A-05', indexSection: 'A',
    title:    'Memorando de Planificación — Auditoría SI',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-MEMO',
  },
  {
    code: 'A-06', indexSection: 'A',
    title:    'Programa de Auditoría de Seguridad de la Información',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-PROG',
  },
  {
    code: 'B-01', indexSection: 'B',
    title:    'Revisión de Gestión de Accesos e Identidades — IAM (ISO A.8)',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-02', indexSection: 'B',
    title:    'Revisión de Gestión de Vulnerabilidades y Parches',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-03', indexSection: 'B',
    title:    'Evaluación de Controles Criptográficos y PKI (ISO A.8.24)',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-04', indexSection: 'B',
    title:    'Revisión de Gestión de Incidentes de Seguridad (ISO A.8.16)',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-05', indexSection: 'B',
    title:    'Evidencia de Pruebas de Penetración y Análisis de Vulnerabilidades',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'C-01', indexSection: 'C',
    title:    'Checklist de Cumplimiento NRP-23 / NRP-32 (BCR/SSF El Salvador)',
    type:     WorkingPaperType.NORMATIVE_ANALYSIS,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-SEC-RISK',
  },
  {
    code: 'C-02', indexSection: 'C',
    title:    'Evaluación Ley de Ciberseguridad D.L. 143/2024 — ACE',
    type:     WorkingPaperType.NORMATIVE_ANALYSIS,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'D-01', indexSection: 'D',
    title:    'Informe de Auditoría de Seguridad de la Información',
    type:     WorkingPaperType.CLOSURE_CONCLUSION,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-MEMO',
  },
];

/**
 * INDICE-08 — Auditoría de Continuidad del Negocio (ISO 22301:2019 + NRP-24)
 * Applies to: BCP_CONTINUITY
 */
const INDEX_BCP_CONTINUITY: PaperDef[] = [
  {
    code: 'A-01', indexSection: 'A',
    title:    'Alcance del SGCN y Términos del Trabajo (ISO 22301 cl. 4)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'A-02', indexSection: 'A',
    title:    'Entendimiento de la Organización y Contexto de Continuidad',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A1',
  },
  {
    code: 'A-03', indexSection: 'A',
    title:    'BIA — Análisis de Impacto en el Negocio (ISO 22301 cl. 8.3)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-BIA',
  },
  {
    code: 'A-04', indexSection: 'A',
    title:    'Evaluación de Riesgos de Continuidad (ISO 22301 cl. 6.1)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A2',
  },
  {
    code: 'A-05', indexSection: 'A',
    title:    'Evaluación del SCI — Gestión de Continuidad (COSO)',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-COSO',
  },
  {
    code: 'A-06', indexSection: 'A',
    title:    'Memorando de Planificación BCP',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-MEMO',
  },
  {
    code: 'A-07', indexSection: 'A',
    title:    'Programa de Auditoría BCP / ISO 22301',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-PROG',
  },
  {
    code: 'B-01', indexSection: 'B',
    title:    'Revisión Cláusula por Cláusula ISO 22301:2019',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-BIA',
  },
  {
    code: 'B-02', indexSection: 'B',
    title:    'Revisión de Planes de Recuperación — RTO / RPO / MTPoD',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-03', indexSection: 'B',
    title:    'Revisión Sitio Alterno / Infraestructura de Recuperación',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-04', indexSection: 'B',
    title:    'Evidencia de Pruebas y Simulacros (BCI GPG 7.0)',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'C-01', indexSection: 'C',
    title:    'Checklist de Cumplimiento NRP-24 (BCR/SSF El Salvador)',
    type:     WorkingPaperType.NORMATIVE_ANALYSIS,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'D-01', indexSection: 'D',
    title:    'Informe de Auditoría BCP / ISO 22301',
    type:     WorkingPaperType.CLOSURE_CONCLUSION,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-MEMO',
  },
];

/**
 * INDICE-09 — Auditoría de Sistemas de Información y BD (COBIT 2019 + D.L. 144/2024)
 * Applies to: IT_SYSTEMS
 */
const INDEX_IT_SYSTEMS: PaperDef[] = [
  {
    code: 'A-01', indexSection: 'A',
    title:    'Alcance y Objetivos — Auditoría de Sistemas (COBIT 2019)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'A-02', indexSection: 'A',
    title:    'Entendimiento del Entorno TI — Arquitectura y Habilitadores COBIT',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A1',
  },
  {
    code: 'A-03', indexSection: 'A',
    title:    'Evaluación de Riesgo TI (COBIT EDM03 / ISACA ITAF)',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A2',
  },
  {
    code: 'A-04', indexSection: 'A',
    title:    'Evaluación de Controles TI — Generales y Aplicativos (COBIT DSS05)',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A3',
  },
  {
    code: 'A-05', indexSection: 'A',
    title:    'Memorando de Planificación — Auditoría de Sistemas',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-MEMO',
  },
  {
    code: 'A-06', indexSection: 'A',
    title:    'Programa de Auditoría de Sistemas de Información',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-PROG',
  },
  {
    code: 'B-01', indexSection: 'B',
    title:    'Revisión de Control de Acceso a Bases de Datos (COBIT DSS05)',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-02', indexSection: 'B',
    title:    'Revisión de Pistas de Auditoría — Logging y Monitoreo (COBIT DSS06)',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-03', indexSection: 'B',
    title:    'Gestión de Respaldos y Pruebas de Recuperación (COBIT DSS04)',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-04', indexSection: 'B',
    title:    'Gestión de Cambios y Versiones de Sistemas (COBIT BAI06)',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-05', indexSection: 'B',
    title:    'Segregación de Funciones en ERP — SAP / Oracle (ISACA ITAF)',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-06', indexSection: 'B',
    title:    'Cumplimiento Ley de Protección de Datos Personales D.L. 144/2024',
    type:     WorkingPaperType.NORMATIVE_ANALYSIS,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'C-01', indexSection: 'C',
    title:    'Informe de Auditoría de Sistemas de Información',
    type:     WorkingPaperType.CLOSURE_CONCLUSION,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-MEMO',
  },
];

/**
 * INDICE-10 — Auditoría de Prevención de Lavado de Dinero y Activos
 * (Ley LCDA D.L. 498/1998 + NRP-36 + GAFI 40 Recomendaciones + Instructivo UIF V3)
 * Applies to: AML
 */
const INDEX_AML: PaperDef[] = [
  {
    code: 'A-01', indexSection: 'A',
    title:    'Designación y Términos del Trabajo — Auditoría ALD/PLD',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'A-02', indexSection: 'A',
    title:    'Entendimiento del Sujeto Obligado — Marco Legal y Perfil de Negocio',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A1',
  },
  {
    code: 'A-03', indexSection: 'A',
    title:    'Evaluación de Riesgo LA/FT — Metodología NRP-36 / GAFI',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-AML-RISK',
  },
  {
    code: 'A-04', indexSection: 'A',
    title:    'Evaluación de Controles PLD — 3 Líneas de Defensa',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-A3',
  },
  {
    code: 'A-05', indexSection: 'A',
    title:    'Memorando de Planificación ALD/PLD',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-MEMO',
  },
  {
    code: 'A-06', indexSection: 'A',
    title:    'Programa de Auditoría ALD — GAFI / NRP-36',
    type:     WorkingPaperType.PLANNING_UNDERSTANDING,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-PROG',
  },
  {
    code: 'B-01', indexSection: 'B',
    title:    'Prueba de DDC/KYC — Debida Diligencia de Clientes (NRP-36 Art. 15)',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-02', indexSection: 'B',
    title:    'Revisión de PEPs y Listas de Sanciones (OFAC / ONU / UE)',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-03', indexSection: 'B',
    title:    'Revisión de Transacciones Inusuales y Sistema de Monitoreo',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-04', indexSection: 'B',
    title:    'Revisión de ROS — Reportes de Operaciones Sospechosas (UIF / SIRAF)',
    type:     WorkingPaperType.SUBSTANTIVE_TEST,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-05', indexSection: 'B',
    title:    'Evaluación del Oficial de Cumplimiento (Ley LCDA Art. 14)',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'B-06', indexSection: 'B',
    title:    'Revisión de Programa de Capacitación y Cultura ALD',
    type:     WorkingPaperType.CONTROL_EVALUATION,
    wpKind:   WpKind.STANDARD,
  },
  {
    code: 'C-01', indexSection: 'C',
    title:    'Checklist NRP-36 / Instructivo UIF V3 — Cumplimiento',
    type:     WorkingPaperType.NORMATIVE_ANALYSIS,
    wpKind:   WpKind.SMART,
    paperCode: 'PT-AML-RISK',
  },
  {
    code: 'D-01', indexSection: 'D',
    title:    'Informe ALD — Formato CVPCPA Guía V3 (Res. 129/2022)',
    type:     WorkingPaperType.CLOSURE_CONCLUSION,
    wpKind:   WpKind.MASTER,
    paperCode: 'PT-MEMO',
  },
];

// ─── Mapping AuditType → Index ────────────────────────────────────────────────

const AUDIT_TYPE_INDEX: Partial<Record<AuditType, PaperDef[]>> = {
  [AuditType.INTERNAL]:               INDEX_INTERNAL,
  [AuditType.OPERATIONAL]:            INDEX_INTERNAL,
  [AuditType.IT]:                     INDEX_INTERNAL,
  [AuditType.COMPLIANCE]:             INDEX_INTERNAL,
  [AuditType.ESG]:                    INDEX_INTERNAL,
  [AuditType.BCP_DRP]:                INDEX_INTERNAL,
  [AuditType.EXTERNAL]:               INDEX_EXTERNAL,
  [AuditType.FINANCIAL]:              INDEX_EXTERNAL,
  [AuditType.FORENSIC]:               INDEX_FORENSIC,
  // ── Tipos especializados El Salvador ─────────────────────────────────────
  [AuditType.INTERNAL_GOVERNMENTAL]:  INDEX_GOVERNMENTAL,
  [AuditType.EXTERNAL_FINANCIAL]:     INDEX_EXTERNAL_FINANCIAL,
  [AuditType.IT_SECURITY]:            INDEX_IT_SECURITY,
  [AuditType.BCP_CONTINUITY]:         INDEX_BCP_CONTINUITY,
  [AuditType.IT_SYSTEMS]:             INDEX_IT_SYSTEMS,
  [AuditType.AML]:                    INDEX_AML,
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AuditIndexService {
  private readonly logger = new Logger(AuditIndexService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Auto-scaffold working papers for a newly created audit.
   * Creates PT records + initializes PaperSections from templates.
   * Fire-and-forget safe — errors are logged but don't abort the audit creation.
   *
   * If templateId is provided, uses the AuditTemplate from the DB.
   * Falls back to AUDIT_TYPE_INDEX if the template is not found.
   */
  async scaffold(
    auditId:      string,
    auditType:    AuditType,
    preparedById: string,
    templateId?:  string,
  ): Promise<void> {
    let index: PaperDef[];

    if (templateId) {
      const template = await this.prisma.auditTemplate.findUnique({
        where: { id: templateId },
      });
      if (template) {
        index = template.papers as unknown as PaperDef[];
        this.logger.log(
          `[AuditIndex] Using template "${template.name}" (${templateId}) for audit ${auditId}`,
        );
      } else {
        this.logger.warn(
          `[AuditIndex] Template ${templateId} not found — falling back to default index`,
        );
        index = AUDIT_TYPE_INDEX[auditType] ?? INDEX_INTERNAL;
      }
    } else {
      index = AUDIT_TYPE_INDEX[auditType] ?? INDEX_INTERNAL;
    }

    this.logger.log(
      `[AuditIndex] Scaffolding ${index.length} papers for audit ${auditId} (${auditType})`,
    );

    for (const def of index) {
      try {
        const wp = await this.prisma.workingPaper.create({
          data: {
            auditId,
            code:         def.code,
            indexSection: def.indexSection,
            title:        def.title,
            type:         def.type,
            wpKind:       def.wpKind,
            paperCode:    def.paperCode ?? null,
            preparedById,
          },
        });

        // Auto-initialize sections for SMART and MASTER papers
        if (def.paperCode && (def.wpKind === WpKind.SMART || def.wpKind === WpKind.MASTER)) {
          const template = PAPER_TEMPLATES[def.paperCode];
          if (template?.length) {
            await this.prisma.paperSection.createMany({
              data: template.map((t) => ({
                paperId:      wp.id,
                sectionKey:   t.sectionKey,
                label:        t.label,
                description:  t.description   ?? null,
                fieldType:    t.fieldType,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                value:        (t.defaultValue ?? null) as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                options:      (t.options       ?? [])  as any,
                isRequired:   t.isRequired,
                isAutoFilled: t.isAutoFilled,
                sourceRef:    t.sourceRef      ?? null,
                sortOrder:    t.sortOrder,
                aiHint:       t.aiHint         ?? null,
              })),
              skipDuplicates: true,
            });
            this.logger.debug(
              `[AuditIndex]   ✓ ${def.code} (${def.paperCode}) — ${template.length} sections`,
            );
          }
        } else {
          this.logger.debug(`[AuditIndex]   ✓ ${def.code} — STANDARD`);
        }
      } catch (err) {
        // Don't abort scaffold if one paper fails
        this.logger.error(
          `[AuditIndex]   ✗ ${def.code} failed: ${String(err)}`,
        );
      }
    }

    this.logger.log(`[AuditIndex] Scaffold complete for audit ${auditId}`);
  }
}
