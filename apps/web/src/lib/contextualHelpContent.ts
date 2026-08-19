export interface HelpTopic {
  title: string;
  body:  string[];
}

/** Ayuda específica por tipo de papel (paperCode) — tiene prioridad sobre la
 *  ayuda por ruta cuando el usuario está dentro de un papel de trabajo, ya que
 *  todos los papeles comparten la misma ruta `/dashboard/working-papers/[id]`
 *  y solo el paperCode distingue de cuál se trata. Cubre los papeles con
 *  cálculos o convenciones menos obvias — no es un manual completo. */
const PAPER_HELP: Record<string, HelpTopic> = {
  'PT-NIA530': {
    title: 'Muestreo Estadístico (NIA 530)',
    body: [
      'S4 (Evaluación) se recalcula solo a partir de las filas que captures en S5 (Registro de Ítems) — no edites S4 directamente.',
      'El "Factor de Confiabilidad" usa la distribución de Poisson según el nivel de confianza y las excepciones encontradas; a más excepciones, mayor el límite superior de error proyectado.',
      'El semáforo compara el límite superior de error contra tu materialidad de ejecución (ME) definida en la auditoría.',
      'Botón "Consolidar Diferencias" envía el resultado de S4 hacia PT-FIN-B08 automáticamente — no dupliques el hallazgo a mano.',
    ],
  },
  'PT-MRCI': {
    title: 'Matriz de Riesgo, Control e Impacto',
    body: [
      'Cada fila conecta un riesgo identificado con su control mitigante y el impacto residual esperado — mantén la relación 1-a-1 o documenta cuando un control cubre varios riesgos.',
      'El nivel de riesgo residual debe ser una conclusión razonada (riesgo inherente × efectividad del control), no una copia del riesgo inherente.',
    ],
  },
  'PT-COSO': {
    title: 'Evaluación COSO 2013',
    body: [
      'Responde cada pregunta como Sí/No/N-A — el puntaje por componente y por principio se recalcula solo, no lo edites a mano.',
      'Usa el panel "¿Cómo se evalúa?" (ícono de ayuda arriba del puntaje) para el detalle de la metodología de ponderación.',
      'El PDF exportado incluye los gráficos de puntaje tal como se ven en pantalla.',
    ],
  },
  'PT-A5': {
    title: 'Matriz Integrada de Riesgos (RMM)',
    body: [
      'Consolida los riesgos identificados en PT-A2 (entendimiento del negocio) y PT-A3 (control interno) en una sola matriz de Riesgo de Incorrección Material.',
      'Cada riesgo debe quedar vinculado a al menos un procedimiento de respuesta (sustantivo o de control) — es la base de la relación riesgo-respuesta que exige NIA 330.',
    ],
  },
  'PT-FIN-B07': {
    title: 'Análisis de Variaciones (NIA 520)',
    body: [
      'Compara el período actual contra el anterior (o contra presupuesto) — variaciones fuera del umbral de materialidad deben tener una explicación documentada en S1c.',
      'Una variación sin explicación razonable o inconsistente con la respuesta del cliente es, en sí misma, un indicador de riesgo de fraude (NIA 240) — no lo descartes solo porque "así lo explicó el cliente".',
    ],
  },
  'PT-HALL-COM': {
    title: 'Comunicación Formal de Hallazgos',
    body: [
      'S2 y S5 son tablas (MATRIX): agrega una fila por hallazgo comunicado y da seguimiento a su respuesta en S5 cuando llegue.',
      'El botón "Word" genera la carta lista para enviar (encabezado, tabla de hallazgos, plazo de respuesta y firmas) a partir de estas mismas secciones.',
      'Si no hay acuse de recibo por escrito, documenta en S6 cualquier evidencia indirecta (llamada, confirmación verbal) — no dejes la sección vacía.',
    ],
  },
  'PT-FIN-ENCARGO': {
    title: 'Carta de Encargo (NIA 210)',
    body: [
      'Las secciones marcadas como opcionales (responsabilidad por documentos que acompañan los EEFF, distribución electrónica, etc.) solo aparecen en el Word si tienen contenido — déjalas vacías si no aplican a este cliente.',
      'El botón "Word" genera el documento final listo para firma del representante legal.',
    ],
  },
};

interface RouteHelpEntry {
  test: (pathname: string) => boolean;
  topic: HelpTopic;
}

/** Ayuda por ruta — evaluada en orden, la primera coincidencia gana. Las
 *  entradas más específicas van primero para no perder contra un prefijo
 *  más corto (ej. "/dashboard/portfolio/profitability" antes que
 *  "/dashboard/portfolio"). */
const ROUTE_HELP: RouteHelpEntry[] = [
  {
    test: p => p.startsWith('/dashboard/portfolio/profitability'),
    topic: {
      title: 'Rentabilidad por Encargo',
      body: [
        'Costo = horas registradas en el timesheet del encargo × la tasa de costo por hora de cada persona en el año trabajado (Admin › Perfiles de Costeo).',
        'Si a alguien le falta un perfil de costeo para ese año, sus horas quedan marcadas "sin costear" — nunca se asumen en $0, así que el costo total puede estar subestimado si ves ese aviso.',
        'Ingreso = honorario de la Propuesta vinculada a la Carta de Compromiso del encargo. Si el encargo se creó sin seleccionar una carta firmada, verás "Honorario no definido" — vincúlala desde el encargo para que calcule el margen.',
        'Visible solo para roles CAE, Admin y Super Admin — la tasa de costo por hora revela indirectamente la estructura salarial del equipo.',
      ],
    },
  },
  {
    test: p => p.startsWith('/dashboard/portfolio/capacity'),
    topic: {
      title: 'Capacidad y Calendario (Cartera)',
      body: [
        'Cruza las horas netas disponibles de cada persona (Admin › Calendario de la Firma) contra las fechas de cierre fiscal de los encargos activos, para detectar sobrecarga por mes.',
        'Las horas "reales" que se comparan vienen del timesheet — si el equipo no está registrando horas todavía, el mapa de calor no reflejará la carga real aún.',
      ],
    },
  },
  {
    test: p => p.startsWith('/dashboard/portfolio'),
    topic: {
      title: 'Cartera (CRM de Auditoría Externa)',
      body: [
        'Pipeline: Prospecto → Radar de Aceptación (NIA 220/ISQM 1) → Propuesta → Carta de Compromiso firmada → Cliente Activo → Encargo → Auditoría real.',
        'Un cliente necesita un Radar de Aceptación en verde o amarillo para poder crear una Propuesta — si el radar da rojo, el cliente se marca automáticamente como Declinado.',
        '"Aprobar Encargo" es la acción que crea la auditoría real y el expediente — no se puede deshacer desde Cartera.',
      ],
    },
  },
  {
    test: p => p.startsWith('/dashboard/universe'),
    topic: {
      title: 'Universo de Auditoría',
      body: [
        'El score de riesgo de cada entidad combina varios factores ponderados (impacto financiero, complejidad, hallazgos previos, tiempo desde la última auditoría, entre otros) — no es una sola cifra editable a mano.',
        'Las entidades con mayor score son las candidatas naturales para el próximo Plan Anual de Auditoría.',
      ],
    },
  },
  {
    test: p => p.startsWith('/dashboard/admin-tasks'),
    topic: {
      title: 'Tareas Administrativas',
      body: [
        'Para trabajo real del equipo que no cuelga de ningún cliente ni auditoría (capacitación, gestión interna, seguimiento comercial, etc.).',
        'Quien no es Gerente de Auditoría o superior solo ve las tareas asignadas a él o creadas por él — un gerente puede alternar entre "Solo mías" y "Todo el equipo".',
        'Esto registra la tarea en sí (título, responsable, fecha límite); las horas dedicadas se registran aparte, en Captura de Horas con categoría "Administrativo".',
      ],
    },
  },
  {
    test: p => p.startsWith('/dashboard/timesheet'),
    topic: {
      title: 'Registro de Horas',
      body: [
        'Distingue horas facturables/no facturables de cliente (requieren encargo o auditoría) de las administrativas, capacitación, vacaciones, incapacidades y permisos (sin encargo).',
        'Estas horas son la base de Rentabilidad por Encargo y del reporte consolidado — regístralas con la categoría correcta desde el inicio, corregirlas después es más trabajo.',
      ],
    },
  },
  {
    test: p => p.startsWith('/dashboard/admin/cost-profiles'),
    topic: {
      title: 'Perfiles de Costeo',
      body: [
        'La tasa de costo por hora se calcula sola: costo anual total (salario + bonos + cargas patronales + costos indirectos) ÷ horas netas disponibles del perfil de disponibilidad vinculado.',
        'Ver el desglose completo (salario, bonos, %) requiere rol CAE o superior; editarlo requiere Admin.',
      ],
    },
  },
  {
    test: p => p.startsWith('/dashboard/admin/firm-calendar'),
    topic: {
      title: 'Calendario de la Firma',
      body: [
        'Días festivos y disponibilidad anual por persona son la base compartida tanto de la Planificación Anual interna como de Cartera (auditoría externa).',
        'Las horas netas disponibles que calcula esta pantalla son el denominador de la tasa de costo por hora en Perfiles de Costeo.',
      ],
    },
  },
  {
    test: p => p.startsWith('/dashboard/working-papers'),
    topic: {
      title: 'Papeles de Trabajo',
      body: [
        'Cada tipo de papel tiene su propio botón de ayuda (ícono "?" abajo a la derecha) una vez que lo abras — cambia según el papel que estés viendo.',
        'El estado del papel (Borrador → En Revisión → Aprobado) sigue el flujo de firmas del equipo; solo quien tiene el rol adecuado puede avanzarlo.',
      ],
    },
  },
];

const DEFAULT_HELP: HelpTopic = {
  title: 'AuditMind',
  body: [
    'Usa el buscador (⌘K) para saltar rápido a cualquier auditoría, cliente o papel de trabajo.',
    'Cada pantalla de Cartera y de papeles de trabajo específicos tiene su propia ayuda contextual — este es el contenido general.',
  ],
};

/** Resuelve qué ayuda mostrar: el paperCode (si el usuario está dentro de un
 *  papel de trabajo con ayuda específica) gana sobre la ruta; la ruta gana
 *  sobre el contenido genérico. */
export function resolveHelp(pathname: string, activePaperCode?: string | null): HelpTopic {
  if (activePaperCode && PAPER_HELP[activePaperCode]) {
    return PAPER_HELP[activePaperCode];
  }
  const routeMatch = ROUTE_HELP.find(entry => entry.test(pathname));
  if (routeMatch) return routeMatch.topic;
  return DEFAULT_HELP;
}
