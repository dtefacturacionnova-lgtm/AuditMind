// ─── Semilla de la Biblioteca de Contenido — datos iniciales de sistema ───────
// Reemplaza los antiguos archivos estáticos substantive-procedure-library.ts y
// coso-question-library.ts: este archivo solo se usa UNA VEZ por organización
// (ensureSystemLibrary) o al presionar "Restaurar biblioteca" (reseedSystemLibrary)
// en ContentLibraryService — el contenido vivo y editable vive en la tabla
// content_library_items, no aquí. Para agregar contenido nuevo al catálogo base
// de la aplicación, edite este archivo; para que un auditor ajuste su propia
// copia, use la interfaz de administración.

import { ContentLibraryKind } from '@prisma/client';

export interface SeedItem {
  kind:          ContentLibraryKind;
  groupKey:      string;
  groupLabel?:   string;
  itemLabel:     string;
  itemSubtitle?: string;   // Técnica — solo procedimientos
  itemDetails?:  string[]; // preguntas — solo COSO
  sortOrder:     number;
}

// ─── Procedimientos Sustantivos por Área — PT-FIN-C-SUST ──────────────────────

interface ProcSeed { procedimiento: string; tecnica: string; }

const PROCEDURE_GROUPS: Record<string, { label: string; items: ProcSeed[] }> = {
  'C-01': {
    label: 'Caja y Bancos (NIA 505)',
    items: [
      { procedimiento: 'Confirmación bancaria directa a cada banco donde la entidad tuvo cuentas en el período (incluidas cerradas o en cero) — saldo, líneas de crédito, gravámenes y firmantes (NIA 505.7-8)', tecnica: 'Confirmación' },
      { procedimiento: 'Revisión de conciliaciones bancarias de todas las cuentas y seguimiento de cada partida (cheques/depósitos en tránsito, cargos no registrados) al estado de cuenta del período posterior', tecnica: 'Inspección' },
      { procedimiento: 'Corte bancario y prueba de kiting — bank transfer schedule de transferencias entre cuentas propias cercanas al cierre', tecnica: 'Inspección' },
      { procedimiento: 'Arqueo sorpresivo de caja chica / efectivo en caja, en presencia del custodio', tecnica: 'Observación' },
      { procedimiento: 'Revisión de actas de Junta Directiva y contratos de préstamo en busca de gravámenes o pignoraciones no revelados', tecnica: 'Inspección' },
    ],
  },
  'C-03': {
    label: 'Inventarios (NIA 501)',
    items: [
      { procedimiento: 'Asistencia a la toma física de inventario: observar el conteo, realizar pruebas de conteo por muestreo y verificar los procedimientos de corte de entradas/salidas (NIA 501.4)', tecnica: 'Observación' },
      { procedimiento: 'Prueba de corte de compras y ventas alrededor de la fecha de cierre — últimas recepciones y despachos antes del corte, primeros después, registrados en el período correcto', tecnica: 'Inspección' },
      { procedimiento: 'Evaluación de la valuación — costo vs. valor neto de realización (NIC 2); revisión de inventario de lento movimiento u obsoleto y razonabilidad de la provisión', tecnica: 'Cálculo' },
      { procedimiento: 'Reconciliación del conteo físico al mayor / kárdex, investigación de diferencias significativas', tecnica: 'Inspección' },
      { procedimiento: 'Confirmación de inventario en poder de terceros — consignación, almacenes de depósito (NIA 501.8)', tecnica: 'Confirmación' },
      { procedimiento: 'Revisión de compromisos de compra/venta y contratos de cobertura si aplica', tecnica: 'Inspección' },
    ],
  },
  'C-04': {
    label: 'Activo Fijo / PP&E (NIA 500 / NIC 16)',
    items: [
      { procedimiento: 'Verificación física (existencia) de una muestra de activos significativos', tecnica: 'Inspección' },
      { procedimiento: 'Revisión de adiciones del período — inspeccionar facturas/contratos, verificar autorización y confirmar capitalización correcta vs. gasto (NIC 16)', tecnica: 'Inspección' },
      { procedimiento: 'Revisión de bajas/retiros del período — verificar autorización y recalcular la ganancia o pérdida en venta', tecnica: 'Cálculo' },
      { procedimiento: 'Recálculo de la depreciación (método, vida útil, valor residual) para una muestra de activos', tecnica: 'Cálculo' },
      { procedimiento: 'Evaluación de indicios de deterioro (NIC 36) y revisión del análisis de deterioro de la gerencia si existe', tecnica: 'Analítica' },
      { procedimiento: 'Verificación de gravámenes o hipotecas sobre activos fijos — revisión de escrituras y registros públicos', tecnica: 'Inspección' },
    ],
  },
  'C-05': {
    label: 'Inversiones y Valores (NIA 501 / NIIF 9)',
    items: [
      { procedimiento: 'Confirmación directa con custodios o corredores de bolsa de la existencia y titularidad de los valores en cartera', tecnica: 'Confirmación' },
      { procedimiento: 'Verificación de la valuación a valor razonable (cotización de mercado a la fecha de cierre) o costo amortizado según clasificación NIIF 9', tecnica: 'Cálculo' },
      { procedimiento: 'Recálculo de intereses y dividendos devengados', tecnica: 'Cálculo' },
      { procedimiento: 'Revisión de la clasificación (negociable / costo amortizado / otro resultado integral) y su consistencia con el modelo de negocio de la entidad', tecnica: 'Inspección' },
      { procedimiento: 'Evaluación de deterioro de valor — pérdida crediticia esperada (NIIF 9)', tecnica: 'Analítica' },
    ],
  },
  'C-06': {
    label: 'Intangibles y Diferidos (NIC 38)',
    items: [
      { procedimiento: 'Revisión de adiciones — verificar si cumplen los criterios de reconocimiento como activo intangible (NIC 38.18) o deben registrarse como gasto del período', tecnica: 'Inspección' },
      { procedimiento: 'Recálculo de la amortización (vida útil definida vs. indefinida)', tecnica: 'Cálculo' },
      { procedimiento: 'Prueba de deterioro anual para intangibles de vida indefinida y plusvalía (NIC 36) — revisión del modelo de flujos descontados de la gerencia', tecnica: 'Analítica' },
      { procedimiento: 'Verificación de la titularidad legal — registros de propiedad intelectual, contratos de licencia', tecnica: 'Inspección' },
      { procedimiento: 'Revisión de costos de desarrollo capitalizados vs. investigación — deben cumplir los 6 criterios de NIC 38.57', tecnica: 'Inspección' },
    ],
  },
  'C-07': {
    label: 'Cuentas por Pagar (NIA 505)',
    items: [
      { procedimiento: 'Circularización de proveedores principales y por muestreo — confirmación de saldos (NIA 505)', tecnica: 'Confirmación' },
      { procedimiento: 'Búsqueda de pasivos no registrados: revisar pagos posteriores al cierre y facturas recibidas después, para identificar obligaciones del período no registradas', tecnica: 'Inspección' },
      { procedimiento: 'Prueba de corte de compras — últimas recepciones antes del cierre, registradas en el período correcto', tecnica: 'Inspección' },
      { procedimiento: 'Reconciliación de saldos según proveedor vs. según libros para las partidas no confirmadas', tecnica: 'Inspección' },
      { procedimiento: 'Revisión de partidas antiguas o en disputa', tecnica: 'Indagación' },
    ],
  },
  'C-08': {
    label: 'Obligaciones Bancarias y Financieras (NIA 505)',
    items: [
      { procedimiento: 'Confirmación bancaria directa de préstamos y líneas de crédito — saldo, tasa, vencimiento, garantías y covenants (NIA 505.7-8)', tecnica: 'Confirmación' },
      { procedimiento: 'Recálculo de intereses devengados y verificación de la porción corriente vs. no corriente', tecnica: 'Cálculo' },
      { procedimiento: 'Revisión de cumplimiento de covenants financieros a la fecha de cierre y proyectado', tecnica: 'Analítica' },
      { procedimiento: 'Verificación de garantías y colateral otorgado — revisión de contratos y registros públicos', tecnica: 'Inspección' },
      { procedimiento: 'Prueba de clasificación correcta corriente / no corriente según vencimientos contractuales', tecnica: 'Inspección' },
    ],
  },
  'C-09': {
    label: 'Pasivos de Largo Plazo (NIC 37, NIIF 16)',
    items: [
      { procedimiento: 'Revisión de contratos de deuda a largo plazo y confirmación con el acreedor', tecnica: 'Confirmación' },
      { procedimiento: 'Recálculo de provisiones (NIC 37) — evaluación de la base de cálculo y razonabilidad de los supuestos', tecnica: 'Cálculo' },
      { procedimiento: 'Revisión de contratos de arrendamiento y recálculo del pasivo por arrendamiento (NIIF 16) — tasa de descuento, plazo y pagos', tecnica: 'Cálculo' },
      { procedimiento: 'Indagación con el asesor legal sobre litigios y contingencias que puedan requerir provisión', tecnica: 'Indagación' },
      { procedimiento: 'Verificación de la clasificación corriente / no corriente', tecnica: 'Inspección' },
    ],
  },
  'C-10': {
    label: 'Capital, Reservas y Dividendos (NIA 500)',
    items: [
      { procedimiento: 'Revisión de actas de Junta de Accionistas / Directiva que autoricen movimientos de capital (aumentos, disminuciones, dividendos)', tecnica: 'Inspección' },
      { procedimiento: 'Confirmación de la estructura accionaria con el Registro de Comercio / libro de accionistas', tecnica: 'Confirmación' },
      { procedimiento: 'Recálculo de la reserva legal y su cumplimiento con el Código de Comercio (El Salvador: 5% anual hasta el 20% del capital social)', tecnica: 'Cálculo' },
      { procedimiento: 'Verificación del cálculo y registro de dividendos decretados y pagados', tecnica: 'Cálculo' },
      { procedimiento: 'Revisión de la conciliación de movimientos patrimoniales del período (Estado de Cambios en el Patrimonio)', tecnica: 'Inspección' },
    ],
  },
  'C-11': {
    label: 'Ingresos (NIA 240 / NIIF 15)',
    items: [
      { procedimiento: 'Prueba de corte de ventas — últimas facturas antes del cierre, primeras después; riesgo de fraude por reconocimiento anticipado (NIA 240)', tecnica: 'Inspección' },
      { procedimiento: 'Evaluación del modelo de 5 pasos de NIIF 15 para contratos significativos (identificación del contrato, obligaciones de desempeño, precio de transacción, asignación, reconocimiento)', tecnica: 'Inspección' },
      { procedimiento: 'Procedimientos analíticos sustantivos — relación ingresos vs. costo de ventas, márgenes por línea de negocio vs. período anterior', tecnica: 'Analítica' },
      { procedimiento: 'Revisión de términos de venta inusuales (derecho de devolución, consignación, bonificaciones) que puedan afectar el reconocimiento', tecnica: 'Inspección' },
      { procedimiento: 'Revisión de notas de crédito emitidas después del cierre por ventas del período', tecnica: 'Inspección' },
    ],
  },
  'C-12': {
    label: 'Costos y Gastos',
    items: [
      { procedimiento: 'Procedimientos analíticos sustantivos — variación de costos/gastos vs. presupuesto y período anterior, relación con el volumen de actividad', tecnica: 'Analítica' },
      { procedimiento: 'Prueba de corte de gastos — facturas de proveedores de servicios alrededor del cierre', tecnica: 'Inspección' },
      { procedimiento: 'Revisión de la clasificación correcta entre costo de ventas, gastos de operación y gastos financieros', tecnica: 'Inspección' },
      { procedimiento: 'Inspección de una muestra de desembolsos significativos — documentación soporte y autorización', tecnica: 'Inspección' },
      { procedimiento: 'Revisión de gastos con partes relacionadas o inusuales por su naturaleza o monto', tecnica: 'Indagación' },
    ],
  },
};

export const SUBSTANTIVE_PROCEDURE_SEED: SeedItem[] = Object.entries(PROCEDURE_GROUPS).flatMap(
  ([groupKey, group]) => group.items.map((item, i): SeedItem => ({
    kind:         ContentLibraryKind.SUBSTANTIVE_PROCEDURE,
    groupKey,
    groupLabel:   group.label,
    itemLabel:    item.procedimiento,
    itemSubtitle: item.tecnica,
    sortOrder:    i,
  })),
);

// ─── Preguntas de Evaluación COSO 2013 — PT-COSO ───────────────────────────────

interface CosoSeed { principio: string; preguntas: string[]; }

const COSO_GROUPS: Record<string, { label: string; items: CosoSeed[] }> = {
  S1: {
    label: 'Entorno de Control (P1-P5)',
    items: [
      {
        principio: 'P1 — Compromiso con la integridad y los valores éticos',
        preguntas: [
          '¿La entidad ha adoptado e implementado un Código de Ética/Conducta que establece valores y estándares de comportamiento para la dirigencia y los empleados? ¿En qué normativa está formalizado?',
          '¿Cómo se evalúa el cumplimiento del Código de Ética/Conducta y con qué periodicidad?',
          'Cuando se identifican desviaciones a los estándares de conducta esperados, ¿cómo se corrigen (medidas disciplinarias)?',
        ],
      },
      {
        principio: 'P2 — Independencia y supervisión del órgano de gobierno',
        preguntas: [
          '¿Cómo se asegura el compromiso y la supervisión del Consejo/Junta Directiva en la aplicación de las políticas de control interno a nivel de todas las áreas?',
          '¿De qué forma la Junta Directiva define y evalúa periódicamente las habilidades, independencia y experiencia necesarias entre sus miembros?',
          '¿El Consejo/Junta Directiva, como máxima autoridad, interactúa de manera suficiente con las unidades operativas? ¿De qué forma?',
          '¿La Alta Administración participa en establecer y monitorear el plan integral de gestión de riesgos, y da seguimiento a que las estrategias de mitigación se implementen?',
          '¿Las sesiones del Consejo/Junta Directiva incluyen informes de cumplimiento regulatorio, indicadores de riesgo, resultados de auditorías (interna y externa) y evaluaciones de control interno de los 5 componentes?',
        ],
      },
      {
        principio: 'P3 — Estructura organizacional, autoridad y responsabilidad',
        preguntas: [
          '¿Existen descripciones de puesto actualizadas para las funciones ejecutadas por el personal?',
          '¿La estructura organizativa es adecuada para cumplir los objetivos principales y manejar las actividades sustantivas de la entidad?',
          '¿Está ampliamente difundido el organigrama aprobado por el Consejo/Junta Directiva entre el personal y terceros relacionados?',
          '¿Están claramente definidas las funciones y responsabilidades de las principales unidades administrativas?',
          '¿Existe un control de firmas autorizadas y niveles de autorización documentados por monto (matriz de aprobación)?',
          '¿Se cuenta con funciones de auditoría interna, oficialía de cumplimiento u otros órganos de control independientes, según el tamaño y naturaleza de la entidad?',
        ],
      },
      {
        principio: 'P4 — Compromiso con la competencia del personal',
        preguntas: [
          '¿Existen políticas y prácticas que reflejen las expectativas de competencia del personal necesarias para cumplir los objetivos?',
          '¿El reclutamiento y la selección del personal se realiza sobre bases competitivas y abiertas?',
          '¿Está definido y difundido un plan de capacitación y entrenamiento dirigido al personal de las diferentes áreas, enfocado en mejorar competencias?',
          '¿Existen planes de contingencia para la sucesión de posiciones importantes para el control interno (renuncia, incapacidad u otra ausencia)?',
        ],
      },
      {
        principio: 'P5 — Exigencia de responsabilidad por el control interno',
        preguntas: [
          '¿Se consideran eficaces las políticas de recursos humanos para mantener motivado al personal competente y confiable?',
          '¿Las evaluaciones de desempeño se aplican periódicamente y se utilizan para reconocer al personal, promover mejoras y orientar el cumplimiento de objetivos?',
          '¿Existe una rotación razonable en las posiciones importantes de dirección/gerencia (ni excesiva ni nula)?',
          '¿El Consejo/Junta Directiva evalúa y ajusta las presiones excesivas sobre el personal asociadas al cumplimiento de objetivos, para evitar incentivar el fraude?',
        ],
      },
    ],
  },
  S2: {
    label: 'Evaluación de Riesgos (P6-P9)',
    items: [
      {
        principio: 'P6 — Especificación de objetivos claros',
        preguntas: [
          '¿Existe una metodología formal para llevar a cabo cada etapa del proceso de gestión de riesgos (identificación, medición, monitoreo, control/mitigación, divulgación)?',
          '¿Los objetivos de reporte financiero son consistentes con el marco de información financiera aplicable y la materialidad definida en PT-A4?',
          '¿Se cuenta con manuales de políticas y procedimientos por área de negocio, debidamente autorizados?',
        ],
      },
      {
        principio: 'P7 — Identificación y análisis de riesgos',
        preguntas: [
          '¿Existe un documento que describa las características de los principales productos/servicios, incluyendo criterios de aprobación, autoridades y proceso de decisión?',
          '¿Se emiten reportes periódicos sobre la condición general de la cartera/operación principal del negocio?',
          '¿Se han establecido políticas y límites (mínimos y máximos) sobre las principales variables de riesgo del negocio (tasas, precios, exposición)?',
          '¿Se promueven procesos de autoevaluación de riesgos (cuestionarios, entrevistas, talleres) con las personas responsables de cada proceso o línea de negocio?',
          '¿Los resultados de la autoevaluación y sus planes de acción se comunican de forma efectiva a toda la organización?',
        ],
      },
      {
        principio: 'P8 — Evaluación del riesgo de fraude',
        preguntas: [
          '¿Existen mecanismos de control y de ambiente de control establecidos específicamente para mitigar la posibilidad de fraude?',
          '¿Se establecen políticas y procedimientos formales sobre cómo y a quién reportar sospechas de fraude?',
          '¿Existen controles específicos para el manejo de efectivo y valores?',
          '¿Se ha establecido una función de auditoría interna o inspección que realice revisiones aleatorias de controles operativos en operaciones críticas?',
          '¿Las prácticas fraudulentas identificadas son sancionadas y comunicadas de forma consistente a todo el personal?',
        ],
      },
      {
        principio: 'P9 — Identificación y evaluación de cambios significativos',
        preguntas: [
          '¿Se analiza el entorno económico externo para monitorear riesgos relevantes para la entidad?',
          '¿Se identifican y comparten las mejores prácticas de administración de riesgo de la industria/sector?',
          '¿Se tienen identificados los riesgos a los que está expuesta la entidad, con su probabilidad de ocurrencia e impacto?',
        ],
      },
    ],
  },
  S3: {
    label: 'Actividades de Control (P10-P12)',
    items: [
      {
        principio: 'P10 — Selección y desarrollo de actividades de control',
        preguntas: [
          '¿Existen puntos clave de control definidos por la máxima autoridad sobre los procesos críticos del negocio?',
          '¿Los resultados de la revisión y evaluación de riesgos por el Consejo/Junta Directiva y la Gerencia se documentan y se comunican a los niveles de jefatura?',
          '¿Se ha evaluado la segregación de funciones y, en caso de concentración, se han implementado actividades de control alternativas (compensatorias)?',
          '¿Se mantiene separación entre quienes autorizan y quienes ejecutan las transacciones, especialmente las financieras?',
        ],
      },
      {
        principio: 'P11 — Controles generales sobre tecnología (CGTI)',
        preguntas: [
          '¿Existe vinculación entre los procesos de negocio, las actividades de control automatizadas y los controles generales de TI?',
          '¿Se han implementado actividades de control diseñadas para restringir los derechos de acceso, con el fin de proteger los activos (incluida información confidencial) de amenazas externas e internas?',
          '¿Existe normativa interna para la adquisición, desarrollo y mantenimiento de la tecnología y su infraestructura?',
        ],
      },
      {
        principio: 'P12 — Implementación mediante políticas y procedimientos',
        preguntas: [
          '¿El Consejo/Junta Directiva emite políticas claras y oportunas para orientar las actividades de la entidad?',
          '¿La administración establece responsabilidad y rendición de cuentas para las actividades de control frente a los cuerpos directivos?',
          '¿Con qué periodicidad la administración revisa las actividades de control para determinar su continua relevancia y necesidad de actualización?',
        ],
      },
    ],
  },
  S4: {
    label: 'Información y Comunicación (P13-P15)',
    items: [
      {
        principio: 'P13 — Uso de información relevante y de calidad',
        preguntas: [
          '¿Se provee de informes analíticos y periódicos a los funcionarios idóneos, de forma oportuna y con el nivel de detalle adecuado?',
          '¿Los informes periódicos incluyen comparación con períodos anteriores y notas explicativas de situaciones especiales?',
          '¿Se documentan las acciones tomadas con base en la información producida por los sistemas?',
          '¿Se revisa la información generada por los sistemas para asegurar que sea oportuna, precisa, completa, accesible y confiable? ¿Quién realiza esta revisión?',
        ],
      },
      {
        principio: 'P14 — Comunicación interna efectiva',
        preguntas: [
          '¿Se comunica al personal la información necesaria para que entienda y ejecute sus responsabilidades de control interno (manuales, políticas, funciones)?',
          '¿El Consejo/Junta Directiva y los gerentes reciben informes por área de responsabilidad de forma periódica?',
          '¿Existen líneas de comunicación interna (canal de denuncias) para informar irregularidades?',
        ],
      },
      {
        principio: 'P15 — Comunicación con terceros',
        preguntas: [
          '¿Existen procedimientos definidos para comunicar información relevante y oportuna a grupos de interés externos (accionistas/socios, reguladores, auditores externos)?',
          '¿Existen canales de comunicación abiertos para que clientes, proveedores y otras partes externas reporten inquietudes, y se usa esa información para la toma de decisiones?',
          '¿Los métodos de comunicación externa cumplen con los tiempos de atención y los requerimientos legales/regulatorios aplicables?',
        ],
      },
    ],
  },
  S5: {
    label: 'Actividades de Monitoreo (P16-P17)',
    items: [
      {
        principio: 'P16 — Evaluaciones continuas e independientes',
        preguntas: [
          '¿Se realizan comparaciones periódicas entre los saldos que se acumulan en las unidades operativas y los registrados en contabilidad?',
          '¿Los datos registrados en los sistemas de información se comparan con inventarios físicos y registros contables al menos semestralmente?',
          '¿Los evaluadores que realizan las evaluaciones continuas e independientes están capacitados y tienen suficiente conocimiento para identificar fallas o mejoras?',
          '¿Existe un sistema de indicadores de alerta oportuno, específico, medible y comunicado de manera efectiva a la organización?',
        ],
      },
      {
        principio: 'P17 — Evaluación y comunicación oportuna de deficiencias',
        preguntas: [
          '¿La Administración o el Consejo/Junta Directiva evalúa los resultados de las evaluaciones continuas e independientes, incluyendo las que reportan fallas o necesidad de medidas correctivas?',
          '¿La administración se asegura de que las fallas identificadas se resuelvan oportunamente?',
          '¿Se regularizan oportunamente las diferencias identificadas en las conciliaciones periódicas?',
        ],
      },
    ],
  },
};

export const COSO_QUESTION_SEED: SeedItem[] = Object.entries(COSO_GROUPS).flatMap(
  ([groupKey, group]) => group.items.map((item, i): SeedItem => ({
    kind:        ContentLibraryKind.COSO_QUESTION,
    groupKey,
    groupLabel:  group.label,
    itemLabel:   item.principio,
    itemDetails: item.preguntas,
    sortOrder:   i,
  })),
);
