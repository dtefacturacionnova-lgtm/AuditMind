// ─── Biblioteca de Preguntas de Evaluación COSO 2013 — PT-COSO ────────────────
// Catálogo estático: preguntas de evaluación curadas por Componente → Principio,
// generalizadas de un instrumento real de evaluación de control interno (135
// preguntas originales de una cooperativa financiera) a un lenguaje aplicable a
// cualquier tipo de entidad. Un botón en cada sección S1-S5 ("Cargar Preguntas
// Sugeridas") busca aquí por sectionKey y agrega las filas (una por principio)
// que aún no existan — nunca sobrescribe Evidencia/Observaciones ni Calificación
// que el auditor ya haya llenado para un principio.
//
// Para agregar/ajustar preguntas: editar el arreglo `preguntas` del principio
// correspondiente — cada entrada es una pregunta de evaluación independiente.

export interface LibraryPrincipleQuestions {
  principio: string;   // Debe coincidir exactamente con el texto usado en el aiHint de paper-templates.ts
  preguntas: string[];
}

export const COSO_QUESTION_LIBRARY: Record<string, LibraryPrincipleQuestions[]> = {
  // ── S1 — Entorno de Control (P1-P5) ──────────────────────────────────────
  S1: [
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

  // ── S2 — Evaluación de Riesgos (P6-P9) ───────────────────────────────────
  S2: [
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

  // ── S3 — Actividades de Control (P10-P12) ────────────────────────────────
  S3: [
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

  // ── S4 — Información y Comunicación (P13-P15) ────────────────────────────
  S4: [
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

  // ── S5 — Actividades de Monitoreo (P16-P17) ──────────────────────────────
  S5: [
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
};
