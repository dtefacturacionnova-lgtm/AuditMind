import { Prisma } from '@prisma/client';
import { AuthUser } from '../../auth/jwt.strategy';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOTOR GENÉRICO DE PLANTILLAS EXCEL — Contrato de tipos (EXC-01)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ver `docs/integracion-excel-plantillas-inteligentes.md` §3.1 para el diseño
 * y la justificación de las decisiones que se codifican aquí.
 *
 * Idea central (Nivel 1 del documento — el mismo patrón de CaseWare
 * "Spreadsheet Analysis" / Workiva "smart linking" / TeamMate+):
 *
 *   1. GENERAR  — AuditMind escribe un .xlsx donde cada dato del encargo vive
 *      en un RANGO CON NOMBRE. Los rangos de zona CONTROLADA quedan bloqueados
 *      por protección de hoja; los de zona LIBRE quedan desbloqueados para que
 *      el auditor trabaje (concilia partidas, escribe explicaciones, etc.).
 *   2. DESCARGAR / TRABAJAR — el auditor edita fuera de línea, en Excel.
 *   3. SUBIR    — el motor lee ÚNICAMENTE los rangos con nombre declarados en
 *      `destino` y enruta cada valor a la `PaperSection` correspondiente, SIEMPRE
 *      a través de `PaperSectionsService.updateSection(paperId, sectionKey, value, user)`,
 *      que ya verifica pertenencia a la organización en cada llamada.
 *
 * Invariante de diseño que sostiene toda la seguridad del motor:
 *
 *   ▸ Sólo se puede LEER lo que el propio motor ESCRIBIÓ. Todo rango legible
 *     debe estar declarado en `origen` (que define su layout) y además listado
 *     en `destino` (que define a dónde va). Cualquier otro contenido del archivo
 *     subido —hojas extra, fórmulas, macros, rangos con nombre añadidos por el
 *     usuario— se ignora por completo. No hay "leer todo y ver qué encaja".
 *
 * NOTA DE ESTADO: este archivo fija el CONTRATO. La implementación
 * (`generarExcelDesdeTemplate` / `leerExcelSegunTemplate`) es EXC-02, y las 6
 * plantillas concretas del catálogo (§4 del documento) son fases posteriores.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1 — Identidad de plantillas
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Catálogo cerrado de plantillas (§4 del documento). Es una unión de literales
 * —no `string`— para que el registro de plantillas y los endpoints validen la
 * clave en tiempo de compilación y no acepten una clave arbitraria del cliente.
 */
export type ExcelTemplateKey =
  | 'COMPOSICION_CUENTA'      // Composición / Análisis de Cuenta   — cualquier C-0X
  | 'CONCILIACION_BANCARIA'   // Conciliación Bancaria               — C-01
  | 'ARQUEO_CAJA'             // Arqueo de Caja                      — C-01
  | 'REVISION_ANALITICA'      // Revisión Analítica (NIA 520)        — PT-FIN-B07
  | 'CIRCULARIZACION_CXC'     // Circularización / Conciliación CxC  — C-02 / PT-NIA530
  | 'CONCILIACION_CXC'        // Conciliación auxiliar vs. contabilidad — C-02
  | 'CONCILIACION_CXP'        // Conciliación auxiliar vs. contabilidad — C-03/C-04
  | 'PRUEBA_PPE'              // Rollforward de Propiedad, Planta y Equipo — B-02a
  | 'CONCILIACION_FISCAL'     // Tax reconciliation                  — PT-FISC-*
  | 'GENERICA';               // Plantilla genérica (EXC-24) — cualquier papel/sección elegible

/** Registro global de plantillas. Espeja la convención de `PAPER_TEMPLATES`. */
export type ExcelTemplateRegistry = Record<ExcelTemplateKey, ExcelTemplateDef>;

// ═══════════════════════════════════════════════════════════════════════════
// 2 — Layout: hojas, rangos, columnas
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Zona de edición de un rango (o de una columna dentro de una tabla).
 *
 * - `CONTROLADA`: la escribe AuditMind y queda BLOQUEADA (`protection.locked = true`
 *   + `worksheet.protect()`). Es el dato del encargo; el auditor no debe alterarlo.
 * - `LIBRE`: queda DESBLOQUEADA (`protection.locked = false`). Es donde el auditor
 *   trabaja. Una columna LIBRE dentro de una tabla CONTROLADA es el caso normal
 *   (p. ej. la muestra sale bloqueada y sólo "valor auditado" se puede escribir).
 *
 * La protección de Excel es una barrera de USABILIDAD, no de seguridad: evita
 * ediciones accidentales de la zona controlada, pero se puede quitar. Por eso el
 * motor NUNCA confía en que la zona controlada volvió intacta — simplemente no
 * la lee (sólo lee lo declarado en `destino`, que normalmente es zona LIBRE).
 */
export type ExcelZona = 'CONTROLADA' | 'LIBRE';

/** Formato de celda. Vocabulario alineado con el enum `FieldType` de Prisma. */
export type ExcelFormatoCelda =
  | 'TEXTO'
  | 'ENTERO'
  | 'NUMERO'
  | 'MONEDA'
  | 'PORCENTAJE'
  | 'FECHA'
  | 'BOOLEANO';

/** Una columna de un rango con forma de TABLA. */
export interface ExcelColumnaDef {
  /** Clave del objeto JSON de cada fila (p. ej. `bookValue`). Debe coincidir con
   *  la clave que espera la `PaperSection` destino, o mapearse en `transformacion`. */
  clave: string;
  /** Encabezado impreso en la hoja (p. ej. "Valor en libros"). */
  encabezado: string;
  /** Ancho de columna en caracteres Excel. */
  ancho?: number;
  formato?: ExcelFormatoCelda;
  /** Override de zona por columna. Si se omite, hereda la zona del rango. */
  zona?: ExcelZona;
  /** Si se define, la columna se genera con validación de datos tipo lista. */
  opciones?: string[];
  /** Texto de ayuda que se escribe como comentario/nota en la celda de encabezado. */
  ayuda?: string;
}

/**
 * Forma del rango.
 * - `ESCALAR`: una sola celda (saldo, fecha de corte, total conciliado…).
 * - `TABLA`: bloque rectangular con encabezado + N filas de datos.
 */
export type ExcelRangoForma =
  | { tipo: 'ESCALAR'; formato?: ExcelFormatoCelda }
  | {
      tipo: 'TABLA';
      columnas: ExcelColumnaDef[];
      /** Filas en blanco que se dejan preparadas cuando no hay datos de origen
       *  (la "zona libre" donde el auditor escribe). */
      filasMinimas: number;
      /** Tope duro de filas, tanto al generar como al leer. Ver `ExcelTemplateLimits`. */
      filasMaximas: number;
    };

/**
 * Declaración de un rango con nombre. TODO rango que exista en el archivo debe
 * declararse aquí — incluidos los completamente vacíos que sólo sirven de zona
 * libre —, porque `destino` sólo puede referirse a rangos ya declarados.
 *
 * Restricciones que impone el motor (derivadas de bugs conocidos de ExcelJS —
 * ver §3.1 del documento):
 *  - `rangoNombre` debe ser ÚNICO en todo el libro (nunca el mismo nombre con
 *    alcance por hoja) y usar el prefijo `AM_`.
 *  - El rango siempre es un rectángulo de celdas con referencia absoluta
 *    (`'Hoja'!$B$6:$E$45`); nunca filas o columnas completas.
 */
export interface ExcelRangoDef {
  /** Nombre del rango, prefijado `AM_` (p. ej. `AM_SaldoLibros`). Único en el libro. */
  rangoNombre: string;
  /** Nombre de la hoja donde vive (debe existir en `hojas`). */
  hoja: string;
  /** Celda superior-izquierda del rango, en A1 (p. ej. `'B6'`). Para TABLA es la
   *  primera celda del ENCABEZADO; el rango con nombre cubre sólo las filas de datos. */
  ancla: string;
  zona: ExcelZona;
  forma: ExcelRangoForma;
  /**
   * Rótulo impreso en la fila inmediatamente encima de `ancla` (para ESCALAR
   * y para TABLA por igual — precisión de EXC-02 sobre el boceto original,
   * que sugería "a la izquierda" para ESCALAR). Esa fila debe quedar libre
   * en el layout del autor de la plantilla.
   */
  etiqueta?: string;
  /** Nota explicativa que se imprime bajo el rótulo. */
  nota?: string;
}

/** Una hoja del libro generado. */
export interface ExcelHojaDef {
  /** Nombre de la pestaña. Máx. 31 caracteres, sin `[]:*?/\` (límite de Excel). */
  nombre: string;
  /** Título impreso en la cabecera de la hoja. */
  titulo?: string;
  /** Celda en la que se congelan paneles (p. ej. `'A6'`). */
  congelarEn?: string;
  /** Anchos por defecto de las columnas A, B, C… */
  anchoColumnas?: number[];
  /** `false` para las hojas que deben quedar totalmente editables (raro).
   *  Por defecto toda hoja se protege y las zonas LIBRE se desbloquean celda a celda. */
  proteger?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 — Contexto de generación
// ═══════════════════════════════════════════════════════════════════════════

/** Datos de cabecera del encargo que se imprimen en la plantilla. */
export interface ExcelAuditInfo {
  auditId: string;
  titulo: string;
  clienteNombre: string | null;
  periodoInicio: Date | null;
  periodoFin: Date | null;
  moneda: string;
}

/**
 * Fila del Balance de Comprobación ya clasificada. Es la forma REAL con la que
 * `PaperSectionsService.propagateTrialBalance` lee `PT-FIN-B00 S2` — se replica
 * literalmente para que las plantillas no inventen un esquema paralelo.
 */
export interface ExcelSaldoTB {
  cuenta: string;
  descripcion: string;
  saldo_actual: number;
  saldo_anterior: number;
  saldo_anterior2: number;
  sub_sumaria: string;
  grupo: string;
}

/** Materialidad del encargo (PT-A4 S3/S4/S5), misma forma que `getMaterialidadByAudit`. */
export interface ExcelMaterialidad {
  /** Materialidad Global. */
  mg: number | null;
  /** Materialidad de Ejecución. */
  me: number | null;
  /** Umbral de Acumulación de Errores. */
  uae: number | null;
}

/**
 * Contexto que reciben las funciones `fuente` y `transformacion`.
 *
 * SEGURIDAD — el contexto se construye SÓLO después de que el servicio haya
 * ejecutado `assertPaperAccess(paperId, user)`. Todos sus accesores están
 * pre-scopeados a `auditId` y `organizationId`: ninguno acepta un `auditId` ni
 * un `paperId` por parámetro, precisamente para que una plantilla mal escrita
 * no pueda alcanzar datos de otro encargo ni de otra organización.
 */
export interface ExcelTemplateContext {
  // ─── Identidad (ya validada) ─────────────────────────────────────────────
  readonly user: AuthUser;
  readonly organizationId: string;
  readonly auditId: string;
  /** Papel desde el que se generó / al que se sube el archivo. */
  readonly paperId: string;
  /** `paperCode` de ese papel (p. ej. `PT-FIN-C-SUST`). */
  readonly paperCode: string;
  readonly templateKey: ExcelTemplateKey;
  readonly generadoEn: Date;
  /** Área contable cuando la plantilla se instancia por área (C-01, C-02…). */
  readonly areaKey?: string;

  readonly audit: ExcelAuditInfo;

  // ─── Accesores de datos (todos scopeados al encargo) ─────────────────────
  /** Valor crudo de una sección del MISMO papel. Precargado: es síncrono. */
  seccion(sectionKey: string): unknown;
  /** Atajo para secciones tipo MATRIX/GRID del mismo papel: siempre devuelve un
   *  arreglo (vacío si la sección no existe o no es un arreglo). */
  filas(sectionKey: string): Array<Record<string, unknown>>;
  /** Sección de OTRO papel del MISMO encargo, resuelto por `paperCode`
   *  (p. ej. `seccionDePapel('PT-NIA530', 'S5')` para la muestra ya seleccionada). */
  seccionDePapel(paperCode: string, sectionKey: string): Promise<unknown>;
  /** Igual que `seccionDePapel` pero garantizando forma de arreglo de filas. */
  filasDePapel(paperCode: string, sectionKey: string): Promise<Array<Record<string, unknown>>>;
  /** Balance de comprobación clasificado (PT-FIN-B00 S2), normalizado. */
  saldosTB(): Promise<ExcelSaldoTB[]>;
  /** Materialidad del encargo (PT-A4). */
  materialidad(): Promise<ExcelMaterialidad>;

  /**
   * Valor YA PARSEADO de OTRO rango de la MISMA subida (§3.2, refuerzo
   * 2026-08-15) — permite que `transformacion`/`validacion` de un rango
   * combinen datos de varios rangos hermanos (p. ej., tres celdas ESCALAR de
   * encabezado + una TABLA de detalle) en un solo cálculo. Solo tiene valor
   * real durante `leer()`; en `generar()` siempre devuelve `null` (nada se ha
   * leído todavía). No hace falta declarar el rango como `destino` para poder
   * leerlo aquí — basta con que esté en `origen[]`.
   */
  rangoLeido(rangoNombre: string): ExcelValorLeido | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4 — Valores leídos del archivo subido
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Primitivo saneado que el lector entrega. El lector NUNCA entrega objetos de
 * ExcelJS: las fórmulas se reducen a su resultado cacheado, el rich-text a su
 * texto plano, los hipervínculos a su texto (la URL se descarta), y las celdas
 * de error (`#REF!`, `#DIV/0!`…) a `null` más una advertencia.
 */
export type ExcelValorCelda = string | number | boolean | Date | null;

/** Una fila leída de un rango con forma de TABLA, indexada por `ExcelColumnaDef.clave`. */
export type ExcelFilaLeida = Record<string, ExcelValorCelda>;

/** Lo que el lector entrega a `transformacion`, según la forma del rango. */
export type ExcelValorLeido =
  | { tipo: 'ESCALAR'; valor: ExcelValorCelda }
  | { tipo: 'TABLA'; filas: ExcelFilaLeida[] };

// ═══════════════════════════════════════════════════════════════════════════
// 5 — Bindings origen / destino
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Un rango del archivo generado. `rango` declara el layout (siempre obligatorio,
 * incluso para zonas libres vacías); `fuente` declara de dónde sale el dato
 * inicial (se omite en las zonas puramente libres).
 *
 * `fuente` debe devolver:
 *  - para `ESCALAR`: un primitivo (`ExcelValorCelda`);
 *  - para `TABLA`: un arreglo de objetos cuyas claves son las `clave` de las columnas.
 */
export interface ExcelOrigenBinding {
  rango: ExcelRangoDef;
  fuente?: (ctx: ExcelTemplateContext) => unknown | Promise<unknown>;
}

/** Marcador para `escribeEn.paperCode`: el mismo papel del que salió el archivo. */
export const EXCEL_MISMO_PAPEL = '@SELF' as const;

/**
 * Cómo se combina el valor leído con lo que la `PaperSection` ya tiene guardado.
 *
 * - `REEMPLAZA`: el valor leído sustituye por completo al guardado. Correcto para
 *   escalares y para tablas que el auditor sólo mantiene en Excel. OJO para
 *   autores de plantillas: en este modo las columnas CONTROLADAS también regresan
 *   del archivo (la protección de Excel es de usabilidad, no de seguridad) — una
 *   tabla REEMPLAZA idealmente debe ser de zona LIBRE completa, o su dato
 *   controlado debe ser re-derivable de la fuente original (TB, etc.).
 * - `FUSIONA_POR_CLAVE`: se hace merge fila a fila usando `claveFusion`. Es el
 *   modo obligatorio cuando la sección destino tiene columnas que sólo existen en
 *   la app (p. ej. `PT-NIA530 S5` guarda más campos por ítem de los que viaja la
 *   plantilla de circularización): sin esto, subir el Excel borraría trabajo hecho
 *   en pantalla. Reglas del merge (refuerzo QA 2026-08-15):
 *     · Fila emparejada: sólo se copian columnas de zona LIBRE — las CONTROLADAS
 *       nunca sobreescriben la BD, aunque el archivo venga alterado.
 *     · Fila nueva (clave sin correspondencia): se agrega completa.
 *     · Fila sin valor en `claveFusion`: se OMITE con advertencia — agregarla
 *       duplicaría filas imposibles de emparejar en cada re-subida.
 *     · Filas de la BD sin correspondencia en el Excel se CONSERVAN (el motor
 *       nunca borra por omisión).
 */
export type ExcelModoEscritura = 'REEMPLAZA' | 'FUSIONA_POR_CLAVE';

/**
 * Un rango que se lee al volver a subir el archivo y a dónde se enruta.
 * `rangoNombre` DEBE existir en `origen[]` — el motor lo valida al arrancar y
 * rechaza el registro de plantillas si no cuadra.
 */
export interface ExcelDestinoBinding {
  rangoNombre: string;
  escribeEn: {
    /** `paperCode` del papel destino, o `EXCEL_MISMO_PAPEL` para el papel de origen. */
    paperCode: string;
    sectionKey: string;
    /** Área contable, cuando la sección destino agrupa filas por área. */
    areaKey?: string;
  };
  modo?: ExcelModoEscritura;
  /** Columna llave para `FUSIONA_POR_CLAVE` (p. ej. `'rowId'` o `'ref'`). */
  claveFusion?: string;
  /**
   * Convierte lo leído al JSON que espera la sección. Si se omite, el motor
   * guarda el valor saneado tal cual (primitivo para ESCALAR, arreglo de filas
   * para TABLA). El valor de retorno se guarda en `PaperSection.value`, que es
   * `Json?` en Prisma — de ahí el tipo `Prisma.InputJsonValue`.
   */
  transformacion?: (
    valorLeido: ExcelValorLeido,
    ctx: ExcelTemplateContext,
  ) => Prisma.InputJsonValue | Promise<Prisma.InputJsonValue>;
  /**
   * Validación de negocio previa a la escritura. Devuelve un mensaje de error
   * (que se le muestra al auditor y aborta la escritura de ESE rango) o `null`
   * si el valor es aceptable. P. ej.: "la conciliación no cuadra con el saldo
   * en libros por $X".
   */
  validacion?: (valorLeido: ExcelValorLeido, ctx: ExcelTemplateContext) => string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6 — Definición de plantilla
// ═══════════════════════════════════════════════════════════════════════════

export interface ExcelTemplateDef {
  key: ExcelTemplateKey;
  label: string;
  descripcion?: string;
  /** `paperCode`s en los que la plantilla puede usarse (p. ej. `['PT-FIN-C-SUST']`).
   *  El endpoint de subida verifica que el `paperCode` real del `paperId` de la URL
   *  esté en esta lista antes de leer nada. */
  paperCodeAplicable: string[];
  /** Versión del layout. Se sella en el manifiesto del archivo generado; si el
   *  auditor sube un archivo de una versión anterior, el motor lo rechaza en vez
   *  de leer rangos que pudieron haberse movido de sitio. */
  version: number;
  /** Hojas del libro. La primera es la que se muestra al abrir. */
  hojas: ExcelHojaDef[];
  /** Layout completo del libro: TODO rango con nombre se declara aquí. */
  origen: ExcelOrigenBinding[];
  /** Subconjunto de `origen` que se lee de vuelta, y a dónde va cada valor. */
  destino: ExcelDestinoBinding[];
  /** Overrides de los límites por defecto, para plantillas atípicamente grandes. */
  limites?: Partial<ExcelTemplateLimits>;
  /**
   * Solo para `key: 'GENERICA'` (EXC-24) — descriptor JSON compacto de qué
   * secciones/columnas se usaron para construir ESTE `def` en particular (a
   * diferencia de las otras 6 plantillas, cuyo layout es fijo, el de la
   * genérica varía en cada descarga según qué secciones eligió el auditor).
   * Se sella dentro del manifiesto firmado (ver `ExcelTemplateManifest.genericLayout`)
   * para que `leer()` pueda reconstruir el MISMO `def` exacto sin volver a
   * inferir columnas de datos que pudieron haber cambiado mientras tanto.
   */
  genericLayout?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 7 — Límites duros (superficie de ataque del archivo subido)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Topes que el motor aplica SIEMPRE, tanto al generar como al leer.
 * Razonamiento en §3.1 del documento; resumen:
 *
 * - `maxUploadBytes` (10 MB): más bajo que los 25 MB del resto de adjuntos de
 *   papeles de trabajo porque el archivo aceptado es uno que NOSOTROS generamos,
 *   cuyo tamaño está acotado por `filasMaximas`. Un umbral bajo reduce el
 *   material disponible para una bomba de descompresión: el .xlsx es un ZIP y
 *   `ExcelJS.xlsx.load()` lo descomprime completo en memoria. NOTA: el
 *   `FileInterceptor` del endpoint de subida también corta en 10 MB — un
 *   override de `limites.maxUploadBytes` por plantilla sólo puede BAJAR el
 *   límite efectivo, no subirlo (subir ambos requiere tocar el controlador).
 * - `maxCeldasLeidas`: corta la lectura aunque el archivo pese poco pero declare
 *   una malla enorme (el otro vector de amplificación típico de OOXML).
 * - `parseTimeoutMs`: el parseo de ExcelJS no es cancelable; la lectura se hace
 *   con timeout y el request se aborta si lo excede.
 */
export interface ExcelTemplateLimits {
  maxUploadBytes: number;
  maxHojas: number;
  maxFilasPorTabla: number;
  maxColumnasPorTabla: number;
  maxCeldasLeidas: number;
  maxLargoTextoCelda: number;
  parseTimeoutMs: number;
}

export const EXCEL_LIMITES_POR_DEFECTO: ExcelTemplateLimits = {
  maxUploadBytes:       10 * 1024 * 1024,
  maxHojas:             12,
  maxFilasPorTabla:     5_000,
  maxColumnasPorTabla:  60,
  maxCeldasLeidas:      100_000,
  maxLargoTextoCelda:   4_000,
  parseTimeoutMs:       15_000,
};

/** Extensión y MIME aceptados. `.xlsm` (con macros) se rechaza explícitamente. */
export const EXCEL_EXTENSION_ACEPTADA = '.xlsx' as const;
export const EXCEL_MIME_ACEPTADOS: readonly string[] = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
/** Firma ZIP (`PK\x03\x04`) — se verifica sobre el buffer antes de parsear,
 *  porque ni la extensión ni el MIME que manda el navegador son confiables. */
export const EXCEL_MAGIC_ZIP: readonly number[] = [0x50, 0x4b, 0x03, 0x04];

// ═══════════════════════════════════════════════════════════════════════════
// 8 — Manifiesto sellado (integridad del round-trip)
// ═══════════════════════════════════════════════════════════════════════════

/** Hoja oculta donde viaja el manifiesto del archivo generado. */
export const EXCEL_MANIFEST_HOJA = '_AuditMind' as const;
/** Rango con nombre que apunta a la celda del manifiesto. */
export const EXCEL_MANIFEST_RANGO = 'AM_Manifest' as const;

/**
 * Manifiesto que el motor escribe (serializado a JSON) en una hoja oculta del
 * archivo generado, y que verifica al recibirlo de vuelta.
 *
 * `firma` es un HMAC-SHA256 sobre `v|templateKey|templateVersion|paperId|auditId|
 * organizationId|generadoEn`, con un secreto de servidor. No es la frontera de
 * seguridad (esa la da `updateSection`, que revalida la organización contra el
 * JWT en cada escritura) — es un control de INTEGRIDAD que evita en la práctica:
 *  - subir la plantilla de un papel a otro papel (paperId no coincide con la URL);
 *  - subir un archivo de otro encargo u otra organización;
 *  - subir un archivo de una versión de layout ya retirada;
 *  - subir un libro fabricado a mano con rangos con nombre inventados.
 *
 * Política: FALLA CERRADO. Si la hoja no está, el JSON no parsea, la firma no
 * valida, o cualquier campo no coincide con el contexto de la petición, el motor
 * rechaza el archivo completo y no escribe nada.
 */
export interface ExcelTemplateManifest {
  /** Versión del formato del propio manifiesto. */
  v: 1;
  templateKey: ExcelTemplateKey;
  templateVersion: number;
  paperId: string;
  auditId: string;
  organizationId: string;
  /** ISO-8601. */
  generadoEn: string;
  /** `AuthUser.id` de quien generó el archivo. */
  generadoPor: string;
  /**
   * Área contable para la que se generó el archivo (C-01, C-02…), cuando la
   * plantilla se instancia por área. Viaja sellado dentro de la firma y el
   * motor lo RESTAURA en el contexto al importar — sin esto, una plantilla de
   * un papel compartido por área (PT-FIN-C-SUST cubre C-01..C-12) no sabría a
   * qué área pertenece el archivo que regresa.
   */
  areaKey?: string;
  /**
   * Solo para `templateKey: 'GENERICA'` — descriptor JSON compacto (ver
   * `ExcelTemplateDef.genericLayout`) de qué secciones/columnas se usaron
   * para construir ESTE archivo. Sellado en la firma igual que `areaKey`,
   * y restaurado al `def` reconstruido en `leerGenerica()`.
   */
  genericLayout?: string;
  /** HMAC-SHA256 en hexadecimal. */
  firma: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 9 — Resultados de la lectura
// ═══════════════════════════════════════════════════════════════════════════

/** Incidencia no fatal: el motor siguió adelante pero el auditor debe enterarse. */
export interface ExcelAdvertencia {
  rangoNombre?: string;
  celda?: string;
  mensaje: string;
}

/** Una sección efectivamente actualizada por la subida. */
export interface ExcelSeccionEscrita {
  paperId: string;
  paperCode: string;
  sectionKey: string;
  rangoNombre: string;
  /** Filas escritas cuando el rango era una TABLA. */
  filas?: number;
}

/** Lo que devuelve el endpoint de subida. */
export interface ExcelLecturaResultado {
  templateKey: ExcelTemplateKey;
  paperId: string;
  rangosLeidos: number;
  seccionesActualizadas: ExcelSeccionEscrita[];
  advertencias: ExcelAdvertencia[];
}

/** Metadatos del archivo generado (el buffer va aparte, en el stream de respuesta). */
export interface ExcelGeneracionResultado {
  templateKey: ExcelTemplateKey;
  nombreArchivo: string;
  manifest: ExcelTemplateManifest;
  rangosEscritos: number;
  advertencias: ExcelAdvertencia[];
}
