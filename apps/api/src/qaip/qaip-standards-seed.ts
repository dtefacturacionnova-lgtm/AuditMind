// ─── Catálogo de Standards QAIP — semilla global (no por organización) ────────
// A diferencia de ContentLibraryItem/AuditTemplate, este catálogo es idéntico
// para cualquier despacho: los Standards del IIA y los componentes de la NIGC 1/2
// no se personalizan por organización. Se siembra una sola vez (ensureSeeded) y
// se actualiza editando este archivo + StandardsService.reseed().
//
// Fuentes: The IIA — Quality Assurance and Improvement Program (theiia.org),
// 2024 Global Internal Audit Standards; IAASB — ISQM 1 / ISQM 2 (= NIGC 1/2,
// adoptadas por el CVPCPA, Resolución 129/2022, vigentes desde encargos
// posteriores al 15-dic-2022).

export interface StandardSeed {
  code: string;
  component: string;
  title: string;
  guidance?: string;
  sortOrder: number;
}

export const IIA_INTERNAL_STANDARDS: StandardSeed[] = [
  {
    code: 'Std. 12.1a', component: 'Evaluación Interna',
    title: 'Monitoreo continuo de conformidad con las Normas',
    guidance: 'Evidencia de que el CAE monitorea de forma continua el desempeño y la conformidad del departamento con las Normas Globales, no solo en la evaluación periódica.',
    sortOrder: 10,
  },
  {
    code: 'Std. 12.1b', component: 'Evaluación Interna',
    title: 'Autoevaluación periódica por personal interno conocedor',
    guidance: 'Autoevaluación formal (esta misma QaipAssessment) realizada al menos anualmente, con resultados comunicados a junta/alta dirección.',
    sortOrder: 11,
  },
  {
    code: 'Std. 8.4', component: 'Evaluación Externa',
    title: 'Evaluación Externa de Calidad (EQA) cada 5 años',
    guidance: 'Realizada por evaluador independiente y calificado (al menos un CIA activo en el equipo) o mediante autoevaluación con validación independiente (SAIV). El plan debe discutirse con la junta.',
    sortOrder: 20,
  },
  {
    code: 'Std. 12.2', component: 'Medición de Desempeño',
    title: 'Objetivos y metodología de medición de desempeño',
    guidance: 'Objetivos de desempeño definidos, metodología para evaluar el progreso, retroalimentación solicitada a junta/alta dirección, y planes de acción documentados ante brechas.',
    sortOrder: 30,
  },
  {
    code: 'Std. 12.3a', component: 'Supervisión del Encargo',
    title: 'Programas de trabajo completos antes de concluir',
    guidance: 'Evidencia de que la supervisión verifica que cada encargo tiene un programa de trabajo completo antes de emitir conclusiones.',
    sortOrder: 40,
  },
  {
    code: 'Std. 12.3b', component: 'Supervisión del Encargo',
    title: 'Papeles de trabajo con evidencia suficiente',
    guidance: 'Los papeles de trabajo sustentan adecuadamente los hallazgos y conclusiones; conformidad con la metodología interna.',
    sortOrder: 41,
  },
  {
    code: 'Std. 12.3c', component: 'Supervisión del Encargo',
    title: 'Retroalimentación de desempeño al equipo',
    guidance: 'El supervisor entrega retroalimentación de desempeño a los auditores internos durante y al cierre del encargo.',
    sortOrder: 42,
  },
  {
    code: 'Std. 8.3', component: 'Reporte a Gobierno',
    title: 'Comunicación anual a junta/alta dirección',
    guidance: 'Al menos una vez al año: conformidad con las Normas, logro de objetivos de desempeño, cumplimiento legal/regulatorio si aplica, y planes ante deficiencias.',
    sortOrder: 50,
  },
];

export const NIGC_EXTERNAL_STANDARDS: StandardSeed[] = [
  {
    code: 'NIGC1-C1', component: 'Proceso de Evaluación de Riesgos',
    title: 'Objetivos de calidad, riesgos identificados y respuestas diseñadas',
    guidance: 'El despacho establece objetivos de calidad, identifica y evalúa riesgos de calidad (probabilidad e impacto), y diseña/implementa respuestas — enfoque basado en riesgo, iterativo.',
    sortOrder: 10,
  },
  {
    code: 'NIGC1-C2', component: 'Gobierno y Liderazgo',
    title: 'Cultura de calidad y responsabilidad de la alta dirección',
    guidance: 'Responsabilidad clara por la calidad en la cima del despacho, con acciones de liderazgo, asignación de recursos y comportamientos que refuercen una cultura de calidad. Los socios están involucrados de forma visible.',
    sortOrder: 20,
  },
  {
    code: 'NIGC1-C3', component: 'Requerimientos Éticos Relevantes',
    title: 'Independencia y cumplimiento ético del despacho y su personal',
    guidance: 'Políticas y procedimientos que aseguran el cumplimiento de los requerimientos éticos relevantes, incluida la independencia, por el despacho y todo su personal.',
    sortOrder: 30,
  },
  {
    code: 'NIGC1-C4', component: 'Aceptación y Continuidad',
    title: 'Evaluación de aceptación/continuidad de clientes y encargos',
    guidance: 'Cubierto por el Radar de Aceptación de Cartera — verificar que todo cliente activo tenga una AcceptanceCheck vigente y decidida para el período.',
    sortOrder: 40,
  },
  {
    code: 'NIGC1-C5', component: 'Desempeño del Encargo',
    title: 'Dirección, supervisión y revisión del encargo',
    guidance: 'Evidencia de dirección, supervisión y revisión adecuadas de cada encargo; Revisión de Calidad del Encargo (NIGC 2) para los que la ameriten.',
    sortOrder: 50,
  },
  {
    code: 'NIGC1-C6', component: 'Recursos',
    title: 'Recursos humanos, tecnológicos e intelectuales',
    guidance: 'Documentación de herramientas, capacitación, metodología y proveedores de servicio utilizados; competencias y CPE del personal.',
    sortOrder: 60,
  },
  {
    code: 'NIGC1-C7', component: 'Información y Comunicación',
    title: 'Comunicación interna y externa sobre el sistema de calidad',
    guidance: 'El despacho comunica internamente (personal) y externamente (según corresponda) información relevante sobre su sistema de gestión de calidad.',
    sortOrder: 70,
  },
  {
    code: 'NIGC1-C8', component: 'Monitoreo y Remediación',
    title: 'Monitoreo del sistema, causa raíz obligatoria y remediación',
    guidance: 'Monitoreo continuo y periódico del sistema de calidad; análisis de causa raíz OBLIGATORIO para toda deficiencia identificada, con plan de remediación documentado.',
    sortOrder: 80,
  },
  {
    code: 'NIGC2-EQR', component: 'Revisión de Calidad del Encargo',
    title: 'Elegibilidad y desempeño del revisor de calidad del encargo',
    guidance: 'Para encargos de entidades de interés público o que el despacho determine de alto riesgo: revisor independiente del equipo, competente, con 2 años de enfriamiento si fue el socio del encargo.',
    sortOrder: 90,
  },
];
