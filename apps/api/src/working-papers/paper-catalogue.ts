// ─── Paper Catalogue — Única fuente de verdad de plantillas disponibles ───────
// Este archivo centraliza qué papeles existen y cuáles aplican a cada tipo de
// auditoría. El frontend consume GET /working-papers/catalogue?auditType=X.

export interface PaperCatalogueEntry {
  code:   string;
  title:  string;
  wpKind: 'SMART' | 'MASTER';
  type:   string;
  group:  string;
  hint:   string;
  // true = esta plantilla se reutiliza a propósito varias veces en el mismo
  // encargo (ej. PT-FIN-C-SUST sirve a 11 áreas C-XX distintas) — el selector
  // de "nuevo papel" no debe deshabilitarla solo porque ya se usó una vez.
  reusable?: boolean;
}

export const PAPER_CATALOGUE: PaperCatalogueEntry[] = [

  // ── General — Planificación y Riesgo ──────────────────────────────────────
  { code: 'PT-A1',    group: 'General — Planificación y Riesgo', wpKind: 'SMART',  type: 'PLANNING_UNDERSTANDING', title: 'Entendimiento del Negocio y Entorno',                           hint: 'Contexto del sector, estructura, regulación y entorno' },
  { code: 'PT-A2',    group: 'General — Planificación y Riesgo', wpKind: 'SMART',  type: 'PLANNING_UNDERSTANDING', title: 'Evaluación de Riesgo Inherente (RI)',                            hint: 'Aserciones por área y factores de riesgo significativo' },
  { code: 'PT-A3',    group: 'General — Planificación y Riesgo', wpKind: 'SMART',  type: 'CONTROL_EVALUATION',     title: 'Evaluación de Controles y Riesgo de Control',                   hint: 'Diseño y efectividad operativa de controles clave' },
  { code: 'PT-A4',    group: 'General — Planificación y Riesgo', wpKind: 'SMART',  type: 'PLANNING_UNDERSTANDING', title: 'Cálculo de Materialidad (NIA 320)',                              hint: 'MG, ME y UAE con benchmark referencial automático' },
  { code: 'PT-A5',    group: 'General — Planificación y Riesgo', wpKind: 'SMART',  type: 'CONTROL_EVALUATION',     title: 'Matriz Integrada RMM — Consolidación RI + RC (NIA 315.32)',     hint: 'Consolida PT-A2 (RI) + PT-A3 (RC) → RMM por área/aserción → alimenta PT-PROG y PT-MEMO' },
  { code: 'PT-COSO',  group: 'General — Planificación y Riesgo', wpKind: 'SMART',  type: 'CONTROL_EVALUATION',     title: 'Evaluación COSO 2013 — SCI (5 Comp./17 P.)',                    hint: '5 componentes, 17 principios, semáforo global y enfoque de auditoría' },
  { code: 'PT-STRAT', group: 'General — Planificación y Riesgo', wpKind: 'SMART',  type: 'PLANNING_UNDERSTANDING', title: 'Estrategia Global de Auditoría (NIA 300 §7-9)',                  hint: 'Alcance, enfoque, materialidad, especialistas NIA 620, KAMs NIA 701, equipo y cronograma' },
  { code: 'PT-APE04', group: 'General — Planificación y Riesgo', wpKind: 'SMART',  type: 'PLANNING_UNDERSTANDING', title: 'Seguimiento de Hallazgos de Auditorías Anteriores (NIA 265/315/450/510)', hint: 'Catálogo Big 4, dashboard, 18-col seguimiento, No Implementados, impacto en riesgos' },
  { code: 'PT-APE06', group: 'General — Planificación y Riesgo', wpKind: 'SMART',  type: 'CONTROL_EVALUATION',     title: 'Políticas Contables y CI — Entendimiento (NIA 315/NIC 8)',      hint: 'Inventario de políticas NIC 8, cambios, estimaciones NIA 540, checklist CI, conclusión' },
  { code: 'PT-ITGC',  group: 'General — Planificación y Riesgo', wpKind: 'SMART',  type: 'CONTROL_EVALUATION',     title: 'Controles Generales de TI — ITGC (NIA 315/COBIT 2019)',         hint: 'Acceso lógico, gestión cambios, operaciones TI, desarrollo; SOC 1; impacto controles automatizados' },
  { code: 'PT-MEMO',  group: 'General — Planificación y Riesgo', wpKind: 'MASTER', type: 'PLANNING_UNDERSTANDING', title: 'Memorando de Planificación',                                    hint: 'Consolida entendimiento, riesgo, materialidad y estrategia global' },
  { code: 'PT-PROG',  group: 'General — Planificación y Riesgo', wpKind: 'MASTER', type: 'PLANNING_UNDERSTANDING', title: 'Programa de Auditoría',                                         hint: 'Procedimientos auto-generados desde RI + materialidad' },
  { code: 'PT-MRCI',  group: 'General — Planificación y Riesgo', wpKind: 'MASTER', type: 'CONTROL_EVALUATION',     title: 'Matriz de Riesgo, Control e Impacto (MRCI)',                    hint: 'Consolida todos los riesgos identificados con controles mitigantes e impacto en dictamen' },
  { code: 'PT-DIFS',  group: 'General — Planificación y Riesgo', wpKind: 'MASTER', type: 'CLOSURE_CONCLUSION',     title: 'Cédula de Diferencias y Ajustes',                               hint: 'Acumula excepciones, semáforo vs materialidad, propuesta de opinión' },

  // ── Seguimiento de Hallazgos — Universal ──────────────────────────────────
  { code: 'PT-HALL',      group: 'Seguimiento de Hallazgos', wpKind: 'SMART',  type: 'FINDING',           title: 'Hallazgo Individual (5 elementos + seguimiento de respuesta)',               hint: 'Condición, Criterio, Causa, Efecto, Recomendación + comunicación y estado de cierre', reusable: true },
  { code: 'PT-HALL-COM',  group: 'Seguimiento de Hallazgos', wpKind: 'SMART',  type: 'CLOSURE_CONCLUSION', title: 'Comunicación Formal de Hallazgos al Cliente/Área',                           hint: 'Carta estructurada: hallazgos, plazo de respuesta, acuse de recibo, estado' },
  { code: 'PT-HALL-RESP', group: 'Seguimiento de Hallazgos', wpKind: 'MASTER', type: 'CLOSURE_CONCLUSION', title: 'Cédula de Seguimiento — Respondidos, Vigentes y Vencidos',                   hint: 'Consolida todos los hallazgos: tasa de respuesta, vencidos con escalamiento, impacto en informe' },

  // ── Auditoría Financiera — Planificación ──────────────────────────────────
  { code: 'PT-FIN-ENCARGO', group: 'Auditoría Financiera — Planificación', wpKind: 'SMART', type: 'PLANNING_UNDERSTANDING', title: 'Carta de Encargo y Términos del Trabajo (NIA 210)',                      hint: 'Condiciones, alcance, honorarios, responsabilidades, aceptación/continuación del encargo' },
  { code: 'PT-INDEP',      group: 'Auditoría Financiera — Planificación', wpKind: 'SMART', type: 'PLANNING_UNDERSTANDING', title: 'Independencia, Ética y Aceptación del Encargo (NIA 220/IESBA)',          hint: 'Amenazas, salvaguardas, servicios prohibidos, EQR, aceptación/continuación' },
  { code: 'PT-FIN-A3-KC',  group: 'Auditoría Financiera — Planificación', wpKind: 'SMART', type: 'PLANNING_UNDERSTANDING', title: 'Conocimiento del Cliente y Entorno (NIA 315)',                           hint: 'Historia, gobierno corporativo, ciclos clave, partes relacionadas' },
  { code: 'PT-FIN-B00',    group: 'Auditoría Financiera — Planificación', wpKind: 'SMART', type: 'SUBSTANTIVE_TEST',       title: 'Importación Trial Balance y Cédula Madre',                              hint: 'Import Excel/CSV/ERP, clasificador de cuentas, semáforo de materialidad' },
  { code: 'PT-FIN-B07',    group: 'Auditoría Financiera — Planificación', wpKind: 'SMART', type: 'DATA_ANALYSIS',          title: 'Análisis de Variaciones (NIA 520)',                                      hint: 'Horizontal, vertical, 12 ratios financieros, señales de fraude NIA 240' },
  { code: 'PT-NIA250',     group: 'Auditoría Financiera — Planificación', wpKind: 'SMART', type: 'PLANNING_UNDERSTANDING', title: 'Evaluación del Cumplimiento de Leyes y Regulaciones (NIA 250 Rev.)',     hint: 'Marco legal SV, 16 procedimientos, indagaciones dirección, asesor legal, matriz incumplimientos' },
  { code: 'PT-NIA530',     group: 'Auditoría Financiera — Planificación', wpKind: 'SMART', type: 'PLANNING_UNDERSTANDING', title: 'Plan Maestro de Muestreo Estadístico (NIA 530)',                         hint: 'Población, muestra MUS/aleatorio, umbral de error tolerable, resultados' },
  { code: 'PT-NIA610',     group: 'Auditoría Financiera — Planificación', wpKind: 'SMART', type: 'PLANNING_UNDERSTANDING', title: 'Uso del Trabajo de Auditoría Interna (NIA 610)',                         hint: 'Evaluación AI, alcance, competencia/objetividad, resultados utilizados' },
  { code: 'PT-NIA620',     group: 'Auditoría Financiera — Planificación', wpKind: 'SMART', type: 'PLANNING_UNDERSTANDING', title: 'Uso del Trabajo de Experto del Auditor (NIA 620)',                       hint: 'Evaluación de competencia, acuerdo, resultados y referencia en informe' },

  // ── Auditoría Financiera — Cédulas Sumarias ───────────────────────────────
  { code: 'PT-FIN-B01', group: 'Auditoría Financiera — Cédulas Sumarias', wpKind: 'MASTER', type: 'SUBSTANTIVE_TEST', title: 'Cédula Sumaria — Activos Corrientes',    hint: 'B-01a Caja, B-01b CxC, B-01c Inventarios, B-01d Otros AC' },
  { code: 'PT-FIN-B02', group: 'Auditoría Financiera — Cédulas Sumarias', wpKind: 'MASTER', type: 'SUBSTANTIVE_TEST', title: 'Cédula Sumaria — Activos No Corrientes',  hint: 'PP&E, intangibles, inversiones LP' },
  { code: 'PT-FIN-B03', group: 'Auditoría Financiera — Cédulas Sumarias', wpKind: 'MASTER', type: 'SUBSTANTIVE_TEST', title: 'Cédula Sumaria — Pasivos Corrientes',     hint: 'CxP comerciales, obligaciones bancarias CP, impuestos' },
  { code: 'PT-FIN-B04', group: 'Auditoría Financiera — Cédulas Sumarias', wpKind: 'MASTER', type: 'SUBSTANTIVE_TEST', title: 'Cédula Sumaria — Pasivos No Corrientes',  hint: 'Deuda LP, provisiones NIC 37, arrendamientos NIIF 16' },
  { code: 'PT-FIN-B05', group: 'Auditoría Financiera — Cédulas Sumarias', wpKind: 'MASTER', type: 'SUBSTANTIVE_TEST', title: 'Cédula Sumaria — Patrimonio',             hint: 'Capital social, reservas, utilidades retenidas + Estado de Cambios' },
  { code: 'PT-FIN-B06', group: 'Auditoría Financiera — Cédulas Sumarias', wpKind: 'MASTER', type: 'SUBSTANTIVE_TEST', title: 'Cédula Sumaria — Resultados (P&G)',       hint: 'Ingresos, costos, gastos, márgenes, EBITDA vs sector' },

  // ── Auditoría Financiera — Pruebas y Cierre ───────────────────────────────
  { code: 'PT-FIN-C-GEN',    group: 'Auditoría Financiera — Pruebas y Cierre', wpKind: 'SMART',  type: 'SUBSTANTIVE_TEST',   title: 'Área / Cuenta Adicional — Prueba Sustantiva Genérica (comodín)',   hint: 'Para cuentas sin papel C-XX específico: NIIF 16, derivados, biológicos, criptoactivos, etc.', reusable: true },
  { code: 'PT-FIN-C-SUST',   group: 'Auditoría Financiera — Pruebas y Cierre', wpKind: 'SMART',  type: 'SUBSTANTIVE_TEST',   title: 'Prueba Sustantiva por Área (genérico)',                            hint: 'Diferencias auto-push a B-08 cuando superan UAE — reutilizable: Caja, Inventarios, Activo Fijo, Inversiones, Intangibles, CxP, Oblig. Bancarias, Pasivos LP, Capital, Ingresos, Costos', reusable: true },
  { code: 'PT-CIRC',         group: 'Auditoría Financiera — Pruebas y Cierre', wpKind: 'SMART',  type: 'SUBSTANTIVE_TEST',   title: 'Circularización de CxC (NIA 505)',                                 hint: 'Universo CxC, selección, envío, seguimiento y evaluación de respuestas' },
  { code: 'PT-FIN-C-ESTIM',  group: 'Auditoría Financiera — Pruebas y Cierre', wpKind: 'SMART',  type: 'SUBSTANTIVE_TEST',   title: 'Estimaciones Contables (NIA 540 Rev.)',                            hint: 'Espectro de resultados, rango del auditor vs estimación gerencia, indicadores de sesgo' },
  { code: 'PT-NIA570',       group: 'Auditoría Financiera — Pruebas y Cierre', wpKind: 'SMART',  type: 'NORMATIVE_ANALYSIS', title: 'Continuidad Operativa — Negocio en Marcha (NIA 570)',              hint: 'Valoración de la administración, indicadores, revelación, impacto en dictamen' },
  { code: 'PT-NIA550',       group: 'Auditoría Financiera — Pruebas y Cierre', wpKind: 'SMART',  type: 'NORMATIVE_ANALYSIS', title: 'Partes Relacionadas — Identificación y Revelación (NIA 550)',      hint: 'Registro NIC 24, transacciones fuera del curso normal, revelación, representación' },
  { code: 'PT-ADJ-RECLASIF', group: 'Auditoría Financiera — Pruebas y Cierre', wpKind: 'SMART',  type: 'SUBSTANTIVE_TEST',   title: 'Libro de Ajustes y Reclasificaciones del Auditor',                hint: 'AJEs propuestos, alimenta B-08 con diferencias no registradas' },
  { code: 'PT-FIN-B08',      group: 'Auditoría Financiera — Pruebas y Cierre', wpKind: 'MASTER', type: 'CLOSURE_CONCLUSION',  title: 'Diferencias y Semáforo de Opinión',                               hint: 'Acumula diferencias C-XX → semáforo vs MG/ME, opinión propuesta' },
  { code: 'PT-FIN-B09',      group: 'Auditoría Financiera — Pruebas y Cierre', wpKind: 'SMART',  type: 'SUBSTANTIVE_TEST',   title: 'Libro de AJEs — Base Técnica NIIF',                               hint: 'Desde B-08, justificación técnica NIIF, carta propuesta al cliente' },
  { code: 'PT-REP580',       group: 'Auditoría Financiera — Pruebas y Cierre', wpKind: 'SMART',  type: 'CLOSURE_CONCLUSION',  title: 'Carta de Representación (NIA 580)',                                hint: 'Representaciones explícitas e implícitas, período, firmantes' },
  { code: 'PT-NIA560',       group: 'Auditoría Financiera — Pruebas y Cierre', wpKind: 'SMART',  type: 'CLOSURE_CONCLUSION',  title: 'Eventos Posteriores al Cierre (NIA 560)',                          hint: 'Procedimientos de búsqueda, Tipo I (ajuste) y Tipo II (revelación)' },
  { code: 'PT-NIA265',       group: 'Auditoría Financiera — Pruebas y Cierre', wpKind: 'MASTER', type: 'CLOSURE_CONCLUSION',  title: 'Carta de Debilidades de CI (NIA 265)',                             hint: 'Consolida deficiencias de PT-A3/PT-ITGC, componentes COSO, seguimiento año anterior' },
  { code: 'PT-NIA260',       group: 'Auditoría Financiera — Pruebas y Cierre', wpKind: 'SMART',  type: 'CLOSURE_CONCLUSION',  title: 'Comunicación con Gobierno Corporativo (NIA 260)',                  hint: 'Responsabilidades del auditor, hallazgos significativos, independencia, representación' },
  { code: 'PT-FIN-DICT',     group: 'Auditoría Financiera — Pruebas y Cierre', wpKind: 'MASTER', type: 'CLOSURE_CONCLUSION',  title: 'Dictamen del Auditor — NIA 700-720',                               hint: 'Opinión auto-fill desde B-08, KAMs NIA 701, párrafo de énfasis' },

  // ── Auditoría Fiscal SV (NACOT) ───────────────────────────────────────────
  { code: 'PT-FISC-INDEP',   group: 'Auditoría Fiscal SV (NACOT)', wpKind: 'SMART',  type: 'PLANNING_UNDERSTANDING', title: 'Independencia Fiscal (NACOT Sec. 2)',             hint: '5 amenazas CIEPC, servicios prohibidos, salvaguardas' },
  { code: 'PT-FISC-QC',      group: 'Auditoría Fiscal SV (NACOT)', wpKind: 'SMART',  type: 'PLANNING_UNDERSTANDING', title: 'Control de Calidad (NACOT Sec. 3)',               hint: 'Revisor independiente, aprobación previa al dictamen' },
  { code: 'PT-FISC-ENCARGO', group: 'Auditoría Fiscal SV (NACOT)', wpKind: 'SMART',  type: 'PLANNING_UNDERSTANDING', title: 'Carta de Encargo Fiscal (NACOT Sec. 4)',          hint: 'Términos, alcance ISR/IVA/retenciones, SDF 31 mayo' },
  { code: 'PT-FISC-RISK',    group: 'Auditoría Fiscal SV (NACOT)', wpKind: 'SMART',  type: 'CONTROL_EVALUATION',     title: 'Riesgo de Incumplimiento Fiscal',                 hint: 'RI por impuesto, fraude fiscal NIA 240, respuesta planeada' },
  { code: 'PT-FISC-AML',     group: 'Auditoría Fiscal SV (NACOT)', wpKind: 'SMART',  type: 'NORMATIVE_ANALYSIS',     title: 'Indicadores LA/FT (LCLDA / FATF)',               hint: '40 señales FATF, paraísos fiscales, obligaciones UIF' },
  { code: 'PT-FISC-PT',      group: 'Auditoría Fiscal SV (NACOT)', wpKind: 'SMART',  type: 'SUBSTANTIVE_TEST',       title: 'Precios de Transferencia (Art. 199-A CT)',        hint: '5 métodos OCDE, principio plena competencia, ajuste ISR, F982' },
  { code: 'PT-FISC-ZF',      group: 'Auditoría Fiscal SV (NACOT)', wpKind: 'SMART',  type: 'CLOSURE_CONCLUSION',     title: 'Dictamen Semestral Zona Franca / SI',             hint: 'Régimen de exención, 1er y 2do semestre' },
  { code: 'PT-FISC-DICT',    group: 'Auditoría Fiscal SV (NACOT)', wpKind: 'MASTER', type: 'CLOSURE_CONCLUSION',     title: 'Dictamen Fiscal NACOT Anexo 1',                  hint: 'Modelo oficial, 3 tipos de opinión NACOT, independencia auto-fill' },

  // ── Especializado (ISO · NAIG · LA/FT) ───────────────────────────────────
  { code: 'PT-GOV-HAL',  group: 'Especializado (ISO · NAIG · LA/FT)', wpKind: 'SMART', type: 'FINDING',            title: 'Hallazgo Gubernamental (NAIG — 5 elementos)',          hint: 'Condición, Criterio, Causa, Efecto, Recomendación + clasificación NAIG' },
  { code: 'PT-SEC-RISK', group: 'Especializado (ISO · NAIG · LA/FT)', wpKind: 'SMART', type: 'CONTROL_EVALUATION', title: 'Evaluación de Riesgos ISO 27001:2022',                 hint: '93 controles Anexo A, madurez SGSI, NRP-23/32 BCR/SSF' },
  { code: 'PT-BIA',      group: 'Especializado (ISO · NAIG · LA/FT)', wpKind: 'SMART', type: 'SUBSTANTIVE_TEST',   title: 'BIA — Impacto en el Negocio (ISO 22301:2019)',         hint: 'RTO, RPO, MTPoD, dependencias críticas, brecha vs ISO 22301' },
  { code: 'PT-AML-RISK', group: 'Especializado (ISO · NAIG · LA/FT)', wpKind: 'SMART', type: 'CONTROL_EVALUATION', title: 'Riesgo LA/FT — NRP-36 / GAFI Rec. 1',                 hint: 'Clientes 40%, productos 30%, canales 20%, geografía 10%, 3 líneas defensa' },
];

// ── Códigos permitidos por tipo de auditoría ──────────────────────────────────
// Estos sets definen qué papeles pueden agregarse según el tipo de encargo.

const _HALL = ['PT-HALL', 'PT-HALL-COM', 'PT-HALL-RESP'];

const _EXT_FIN = [
  'PT-FIN-ENCARGO', 'PT-INDEP', 'PT-A1', 'PT-A2', 'PT-A3', 'PT-A4', 'PT-A5',
  'PT-COSO', 'PT-STRAT', 'PT-APE04', 'PT-APE06', 'PT-ITGC', 'PT-MRCI',
  'PT-MEMO', 'PT-PROG',
  'PT-NIA250', 'PT-NIA530', 'PT-NIA610', 'PT-NIA620',
  'PT-FIN-A3-KC', 'PT-FIN-B00', 'PT-FIN-B01', 'PT-FIN-B02', 'PT-FIN-B03',
  'PT-FIN-B04', 'PT-FIN-B05', 'PT-FIN-B06', 'PT-FIN-B07', 'PT-FIN-B08', 'PT-FIN-B09',
  'PT-ADJ-RECLASIF', 'PT-DIFS', 'PT-CIRC', 'PT-FIN-C-SUST', 'PT-NIA550', 'PT-NIA570',
  'PT-FIN-C-ESTIM', 'PT-FIN-C-GEN',
  'PT-REP580', 'PT-NIA560', 'PT-NIA265', 'PT-NIA260',
  'PT-FIN-DICT',
  ..._HALL,
];

const _FISCAL = [
  'PT-A1', 'PT-A2', 'PT-A3', 'PT-A4', 'PT-A5', 'PT-STRAT', 'PT-APE04',
  'PT-MEMO', 'PT-PROG',
  'PT-FISC-INDEP', 'PT-FISC-QC', 'PT-FISC-ENCARGO', 'PT-FISC-RISK',
  'PT-FISC-AML', 'PT-FISC-PT', 'PT-FISC-ZF', 'PT-FISC-DICT',
  ..._HALL,
];

const _INTERNAL = [
  'PT-A1', 'PT-A2', 'PT-A3', 'PT-A4', 'PT-A5', 'PT-COSO',
  'PT-STRAT', 'PT-APE04', 'PT-ITGC', 'PT-MRCI',
  'PT-MEMO', 'PT-PROG', 'PT-DIFS',
  ..._HALL,
];

const _NAIG = [
  'PT-A1', 'PT-A2', 'PT-A4', 'PT-A5', 'PT-COSO', 'PT-APE04',
  'PT-MEMO', 'PT-PROG', 'PT-GOV-HAL',
  ..._HALL,
];

const _IT = [
  'PT-A1', 'PT-A3', 'PT-A5', 'PT-ITGC', 'PT-MEMO', 'PT-PROG', 'PT-SEC-RISK', 'PT-BIA',
  ..._HALL,
];

const _AML = [
  'PT-A1', 'PT-A3', 'PT-MEMO', 'PT-PROG', 'PT-AML-RISK',
  ..._HALL,
];

const _FORENSIC = [
  'PT-A2', 'PT-MEMO', 'PT-PROG', 'PT-DIFS',
  ..._HALL,
];

export const ALLOWED_CODES_BY_AUDIT_TYPE: Record<string, string[]> = {
  EXTERNAL:              _EXT_FIN,
  FINANCIAL:             _EXT_FIN,
  EXTERNAL_FINANCIAL:    _EXT_FIN,
  FISCAL:                _FISCAL,
  INTERNAL:              _INTERNAL,
  OPERATIONAL:           _INTERNAL,
  IT:                    _INTERNAL,
  COMPLIANCE:            _INTERNAL,
  ESG:                   _INTERNAL,
  BCP_DRP:               _INTERNAL,
  INTERNAL_GOVERNMENTAL: _NAIG,
  IT_SECURITY:           _IT,
  AML:                   _AML,
  FORENSIC:              _FORENSIC,
};
