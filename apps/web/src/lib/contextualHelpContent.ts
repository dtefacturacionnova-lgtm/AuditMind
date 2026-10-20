export interface HelpTopic {
  title: string;
  body:  string[];
}

/** Qué es la firma electrónica por enlace, para quien la usa por primera vez. Lo muestra el panel «Firma electrónica» (¿Cómo funciona?)
 *  y es la base del resto de la ayuda de la firma. Describe lo que la pantalla hace hoy: ver docs/guia-firma-electronica.md. */
export const SIGNATURE_HELP: HelpTopic = {
  title: 'Firma electrónica por enlace',
  body: [
    'Envías el documento por correo y el firmante lo firma desde un enlace, sin cuenta en AuditMind. Antes de ver el documento confirma su identidad con un código de 6 dígitos que llega a ese mismo correo.',
    'Al enviar, el documento se convierte en PDF y queda congelado: el firmante ve exactamente ese archivo. Si cambias el documento después, la solicitud se revoca y hay que enviarla otra vez.',
    'El enlace completo se muestra una sola vez, en la ventana de envío. Si lo pierdes o el correo no llega, usa «Reenviar»: genera uno nuevo y el anterior deja de funcionar.',
    'Al firmar queda guardado el nombre y el cargo que escribió, la fecha y la hora, la dirección IP, el navegador, el correo verificado, el texto del consentimiento y la huella (SHA-256) del documento, en una bitácora donde cualquier cambio se nota.',
    'El PDF final lleva una hoja de evidencia, el sello de la organización y un sello de tiempo de un tercero. Cualquiera puede comprobarlo en /verificar con el código impreso en el PDF; el archivo no se sube a ningún servidor.',
    'Es firma electrónica simple con evidencia. No es una firma certificada de un Prestador de Servicios de Certificación acreditado: si un caso exige firma certificada, esta función no la reemplaza.',
  ],
};

/** Dos líneas para cerrar la ayuda de cada pantalla desde la que se envía algo a firma. */
const SIGNATURE_BASICS = [
  'El firmante recibe un enlace, confirma su identidad con un código que llega a su correo y firma sin cuenta. El documento queda congelado al enviarlo y el enlace completo se muestra una sola vez.',
  'Es firma electrónica simple con evidencia (fecha, IP, correo verificado, huella del documento, bitácora y PDF sellado), verificable en /verificar. No es una firma certificada.',
];

/** Clave con la que se registra la ayuda de los papeles de entrevista (PT-ENTREV, tipo entrevista y B-INT-*). */
export const INTERVIEW_HELP_KEY = 'PT-ENTREV';

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
  [INTERVIEW_HELP_KEY]: {
    title: 'Entrevista y acta firmada',
    body: [
      'El panel «Actas para firma» envía el acta a la persona entrevistada para que la firme desde un enlace. Redáctala completa en la ventana de envío: el acta no se edita después de enviada. Para corregirla, revoca la solicitud y envía otra.',
      'La persona entrevistada es quien firma: indica si está conforme o escribe sus observaciones (obligatorias si no está conforme). Al sellarse, el PDF firmado se agrega a la sección S2 del papel.',
      'Firma presencial: marca «Firma presencial: no enviar el correo con el enlace» y que la persona abra el enlace en su propio teléfono. El código de verificación sí llega a su correo.',
      'En modo investigación, enviar el acta por correo puede alertar a la persona investigada. Solo el equipo del encargo ve estas solicitudes.',
      ...SIGNATURE_BASICS,
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

const CARTERA_HELP: HelpTopic = {
  title: 'Cartera (CRM de Auditoría Externa)',
  body: [
    'Pipeline: Prospecto → Radar de Aceptación (NIA 220/ISQM 1) → Propuesta → Carta de Compromiso firmada → Cliente Activo → Encargo → Auditoría real.',
    'Un cliente necesita un Radar de Aceptación en verde o amarillo para poder crear una Propuesta — si el radar da rojo, el cliente se marca automáticamente como Declinado.',
    '"Aprobar Encargo" es la acción que crea la auditoría real y el expediente — no se puede deshacer desde Cartera.',
  ],
};

interface RouteHelpEntry {
  test: (pathname: string) => boolean;
  topic: HelpTopic;
}

/** Ayuda por ruta — evaluada en orden, la primera coincidencia gana. Las
 *  entradas más específicas van primero para no perder contra un prefijo
 *  más corto (ej. "/dashboard/portfolio/profitability" antes que
 *  "/dashboard/portfolio"). */

/** Coincide con la ruta exacta o con subrutas — `startsWith` a secas haría que
 *  `/dashboard/admin/organization` capturara también `/dashboard/admin/organizations`. */
const routeIs = (p: string, base: string) => p === base || p.startsWith(base + '/');

const ROUTE_HELP: RouteHelpEntry[] = [
  // ── Administración ───────────────────────────────────────────────────────
  {
    test: p => routeIs(p, '/dashboard/admin/organizations'),
    topic: {
      title: 'Organizaciones (solo Super Admin)',
      body: [
        'Una organización es un despacho o una empresa con su propio equipo: sus usuarios, auditorías, plantillas y datos están aislados de las demás.',
        'NO crees una organización por cliente. Los clientes de un despacho van en Cartera de Clientes, dentro de la organización del despacho.',
        'Crea otra organización solo para otro despacho o empresa con usuarios propios, o para separar un entorno de demo del real.',
        'Al crearla puedes invitar a su primer administrador: recibe un correo y define su propia contraseña. Un correo solo puede pertenecer a una organización.',
        '"Desactivar" bloquea el acceso de todos sus usuarios hasta que la reactives; no borra ningún dato.',
      ],
    },
  },
  {
    test: p => routeIs(p, '/dashboard/admin/organization'),
    topic: {
      title: 'Mi organización',
      body: [
        'Es el perfil de la organización a la que pertenece tu usuario: nombre, color, logotipo y los módulos que ve tu equipo (Interna, Externa o Ambas).',
        'Cambiar la modalidad solo muestra u oculta menús del equipo; no borra ni mueve datos.',
        'Para ver o crear otras organizaciones existe "Organizaciones", visible solo para el Super Admin de la plataforma.',
      ],
    },
  },
  {
    test: p => routeIs(p, '/dashboard/admin/users'),
    topic: {
      title: 'Usuarios',
      body: [
        'Aquí están las personas de TU organización. "Invitar usuario" envía un correo y la persona define su propia contraseña; nadie más la ve.',
        'Un correo electrónico pertenece a una sola organización: quien trabaje en dos necesita un correo distinto en cada una.',
        'Cambiar el rol o desactivar a alguien requiere ser Administrador. Desactivar no borra su trabajo previo.',
      ],
    },
  },
  {
    test: p => routeIs(p, '/dashboard/admin/catalogs'),
    topic: {
      title: 'Catálogos Generales',
      body: [
        'Listas propias de tu organización: la clasificación del organigrama (tipos de entidad) y las categorías de proceso.',
        'Alimentan el Universo de Auditoría y los encargos. Cualquier auditor las consulta; crear, editar o borrar requiere ser Gerente de Auditoría o superior.',
      ],
    },
  },
  {
    test: p => routeIs(p, '/dashboard/admin/index-templates'),
    topic: {
      title: 'Plantillas de Índice',
      body: [
        'Definen la estructura de fases y carpetas del expediente de una auditoría (ej. "IIA Estándar", "Auditoría TI").',
        'Se elige una al inicializar el expediente de un encargo. No confundir con "Plantillas de Auditoría", que definen QUÉ papeles de trabajo se crean.',
        'Una sola plantilla puede ser la predeterminada de la organización. Crear y editar requiere ser Gerente de Auditoría o superior.',
      ],
    },
  },
  {
    test: p => routeIs(p, '/dashboard/admin/audit-templates'),
    topic: {
      title: 'Plantillas de Auditoría',
      body: [
        'Definen qué papeles de trabajo se crean automáticamente al iniciar un encargo, según su tipo (Interna, Financiera Externa, Fiscal, AML…), con sus secciones y vínculos entre papeles.',
        'Las plantillas de sistema vienen precargadas y solo se pueden duplicar; trabaja sobre la copia para adaptarla a tu metodología.',
        'No confundir con "Plantillas de Índice", que definen la estructura de carpetas del expediente.',
      ],
    },
  },
  {
    test: p => routeIs(p, '/dashboard/admin/content-library'),
    topic: {
      title: 'Biblioteca de Contenido',
      body: [
        'Textos reutilizables que alimentan los papeles: procedimientos sustantivos por área (C-01, C-02…) y preguntas COSO por componente.',
        'Cualquier auditor las consulta; crear o editar requiere ser Gerente de Auditoría o superior. "Restaurar biblioteca" repone el contenido de sistema.',
      ],
    },
  },
  {
    test: p => routeIs(p, '/dashboard/admin/data-sources'),
    topic: {
      title: 'Conectores de Datos',
      body: [
        'Conectan fuentes de datos del cliente (SAP, APIs REST) o cargan archivos para alimentar los análisis CAATs.',
        'Prueba cada conexión antes de importar; el resultado de cada importación queda registrado.',
      ],
    },
  },
  {
    test: p => routeIs(p, '/dashboard/admin/watchlists'),
    topic: {
      title: 'Listas de Sanciones',
      body: [
        'Copia local de OFAC, ONU y Reino Unido que usa el screening de PLD. Es la MISMA para todas las organizaciones.',
        'Se actualiza sola cada noche y hay una verificación semanal que repara cualquier lista atrasada. Revisa la fecha de la última sincronización exitosa: si una lista está atrasada, el screening usa datos viejos.',
        'Ver el estado requiere ser Administrador; lanzar una sincronización manual, ser Super Admin.',
      ],
    },
  },
  {
    test: p => routeIs(p, '/dashboard/admin/knowledge'),
    topic: {
      title: 'Base de Conocimiento',
      body: [
        'Son las leyes, normas y guías (NIA, IIA, NAIG, leyes tributarias, PLD…) que consultan los especialistas de IA para citar texto real.',
        'Cada tipo de auditoría consulta su propio marco: Interna → IIA, Gubernamental → NAIG, Externa → CVPCPA, Fiscal y AML con sus leyes. No se mezclan.',
        'Puedes cargar un documento en PDF o desde una URL; queda disponible cuando su estado pasa a "Listo".',
      ],
    },
  },
  {
    test: p => routeIs(p, '/dashboard/admin/settings'),
    topic: {
      title: 'Configuración',
      body: [
        'Tu perfil personal, tus preferencias de IA y tus notificaciones. Lo que cambies aquí solo te afecta a ti, no al resto de la organización.',
      ],
    },
  },
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
    // Ficha de un cliente: la pestaña de la carta de compromiso envía la carta a firma
    test: p => p.startsWith('/dashboard/portfolio/clients/'),
    topic: {
      title: 'Cartera: ficha del cliente y carta de compromiso',
      body: [
        ...CARTERA_HELP.body,
        'En la pestaña de la carta de compromiso, «Enviar para firma» la manda al contacto del cliente (puedes cambiar el nombre y el correo en la ventana). Requiere ser Gerente de Auditoría o superior.',
        'Si el cliente firma, la carta pasa a Firmada y el cliente a Activo. Si la rechaza, ves su motivo. Si cambias el texto de la carta con una solicitud vigente, esa solicitud se revoca y la carta vuelve a borrador.',
        '«Registrar firma manual» sigue disponible para una carta firmada en papel.',
        ...SIGNATURE_BASICS,
      ],
    },
  },
  {
    test: p => p.startsWith('/dashboard/portfolio'),
    topic: CARTERA_HELP,
  },
  {
    test: p => routeIs(p, '/dashboard/confirmations'),
    topic: {
      title: 'Confirmaciones externas (NIA 505) y firma electrónica',
      body: [
        'En el detalle de una confirmación, el panel «Firma electrónica» la envía por correo al confirmante registrado para que responda y firme desde un enlace. «Marcar como enviada» y el registro manual de la respuesta siguen disponibles para lo que llegue por otros medios.',
        'Elige «Con saldo» (el confirmante ve el saldo y dice si está de acuerdo) o «Con saldo en blanco» (escribe el saldo según sus registros, sin ver el tuyo). Si el banco lo exige, anexa la carta de autorización del cliente.',
        'El correo del firmante debe ser el del confirmante registrado: para cambiar al destinatario, edita la confirmación en borrador. Marca que verificaste el correo de forma independiente, como pide NIA 505.',
        'Si el confirmante firma, la confirmación pasa a Recibida. Si decide no firmar, sigue enviada con su motivo y tú decides si queda sin respuesta o con procedimiento alternativo.',
        'Los archivos que adjunta el confirmante pasan por un antivirus y se reconstruyen: abre la copia reconstruida. El original sin reconstruir solo lo abre un gerente.',
        ...SIGNATURE_BASICS,
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
