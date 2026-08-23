// ─── Contenido del modal de metodología por tipo de análisis CAATs ───────────
// Texto fijo, curado para que el auditor entienda qué hace cada análisis, con
// qué método y para qué norma/objetivo de auditoría sirve — sin tener que leer
// el código del backend.

export interface MethodologyInfo {
  objetivo: string;
  metodologia: string;
  normativa?: string;
  pruebas: Array<{ nombre: string; descripcion: string }>;
  limitaciones: string;
}

export const METHODOLOGY: Record<string, MethodologyInfo> = {
  gl: {
    objetivo:
      'Identificar asientos del Libro Mayor con características de riesgo — error, manipulación o fraude — que ameriten revisión adicional del auditor. No concluye por sí solo: filtra el universo de transacciones hacia las que sí requieren atención.',
    metodologia:
      'Análisis basado en reglas heurísticas (rule-based), aplicadas sobre el 100% de los asientos cargados — no es una muestra. Cada regla detecta un patrón específico asociado en la literatura de auditoría a error o manipulación.',
    normativa: 'NIA 240 (fraude), NIA 315 (identificación y evaluación de riesgos), NIA 520 (procedimientos analíticos)',
    pruebas: [
      { nombre: 'Montos Redondos', descripcion: 'Asientos con montos exactos (múltiplos de 1,000+) — indicio de estimación manual o fragmentación en vez de registro real.' },
      { nombre: 'Asientos de Fin de Período', descripcion: 'Registros en los últimos días del período — mayor riesgo de ajustes forzados para maquillar resultados.' },
      { nombre: 'Monto Duplicado por Usuario', descripcion: 'El mismo usuario registra dos o más asientos por el mismo monto — posible doble registro o duplicación deliberada.' },
      { nombre: 'Asientos en Fin de Semana', descripcion: 'Registros fuera del horario laboral normal — requieren justificación de negocio.' },
      { nombre: 'Usuario de Alto Volumen', descripcion: 'Usuarios que concentran un volumen desproporcionado de asientos — posible falta de segregación de funciones.' },
    ],
    limitaciones:
      'Detecta patrones estadísticos y de comportamiento, no confirma fraude ni error por sí mismo. Cada hallazgo requiere corroboración documental del auditor. La calidad depende de que el mapeo de columnas (fecha, monto, usuario) sea correcto.',
  },
  ap: {
    objetivo:
      'Detectar riesgo de fraude o error en el ciclo de Cuentas por Pagar — pagos duplicados, proveedores inexistentes, fraccionamiento de compras y concentración excesiva en pocos proveedores.',
    metodologia:
      'Análisis de reglas + agregación estadística sobre el 100% de las facturas cargadas, cruzando proveedor, monto, fecha de factura y fecha de pago.',
    normativa: 'NIA 240 (fraude en compras/pagos), NIA 500 (evidencia de auditoría)',
    pruebas: [
      { nombre: 'Facturas Duplicadas', descripcion: 'Mismo proveedor, mismo monto, facturas distintas — riesgo de pago duplicado.' },
      { nombre: 'Fraccionamiento de Facturas', descripcion: 'Facturas separadas artificialmente para evadir umbrales de aprobación.' },
      { nombre: 'Proveedores Fantasma', descripcion: 'Proveedores con datos incompletos o sospechosos (sin nombre, cuenta bancaria repetida con otro proveedor) — riesgo de pagos a entidades ficticias.' },
      { nombre: 'Pago Anticipado / Atrasado', descripcion: 'Pagos fuera del plazo normal pactado — puede indicar trato preferencial o problema de flujo de caja.' },
      { nombre: 'Concentración de Proveedores', descripcion: 'Los 3 proveedores principales concentran más del 50% del gasto — riesgo de dependencia o falta de competencia real en las compras.' },
    ],
    limitaciones:
      'La detección de "proveedores fantasma" es indicativa (datos incompletos), no una confirmación — requiere verificación externa (RUC/NIT, domicilio real). Depende de que el archivo incluya identificador de proveedor y cuenta bancaria si se quiere probar cuentas compartidas.',
  },
  payroll: {
    objetivo:
      'Detectar anomalías en el ciclo de nómina — empleados que no deberían existir en planilla, pagos desproporcionados, y controles débiles en el proceso de aprobación de pagos.',
    metodologia:
      'Combina reglas de negocio con análisis estadístico (Z-score) sobre la distribución de salarios brutos, para separar variación normal de outliers genuinos.',
    normativa: 'NIA 240 (fraude en nómina — uno de los esquemas de fraude ocupacional más comunes según ACFE)',
    pruebas: [
      { nombre: 'Empleados Fantasma', descripcion: 'Registros sin nombre o con datos incompletos — posible empleado inexistente cobrando salario real.' },
      { nombre: 'Pagos Atípicos (Z-score)', descripcion: 'Salarios que se desvían significativamente (>2-3 desviaciones estándar) del resto de la planilla — investigar justificación.' },
      { nombre: 'Neto Excede al Bruto', descripcion: 'Error aritmético o de fórmula — el salario neto no puede ser mayor al bruto.' },
      { nombre: 'Cuentas Bancarias Compartidas', descripcion: 'Dos o más "empleados" distintos reciben su pago en la misma cuenta bancaria — señal fuerte de nómina fantasma.' },
      { nombre: 'Concentración de Aprobadores', descripcion: 'Un solo aprobador autoriza una porción desproporcionada de la nómina — riesgo de segregación de funciones.' },
    ],
    limitaciones:
      'El Z-score requiere una base de comparación razonable (>10 empleados) para ser confiable — con planillas muy pequeñas o muy homogéneas, algunos outliers reales pueden no destacarse estadísticamente.',
  },
  benford: {
    objetivo:
      'Screening estadístico de manipulación o invención de montos — la Ley de Benford predice con qué frecuencia debería aparecer cada dígito inicial (1-9) en un conjunto de números "naturales" (no forzados). Desviaciones marcadas son indicio, no prueba, de manipulación.',
    metodologia:
      'Compara la distribución observada del primer dígito de cada monto contra la distribución esperada de Benford, usando dos pruebas complementarias: Chi-cuadrado (significancia estadística) y MAD — Desviación Absoluta Media (escala de conformidad de Nigrini: Cercano/Aceptable/Sospechoso/No Conforme).',
    normativa: 'NIA 240, técnica ampliamente documentada en literatura forense (Nigrini, 2012) y usada por autoridades tributarias y auditores forenses.',
    pruebas: [
      { nombre: 'Prueba Chi-Cuadrado', descripcion: 'Determina si la desviación observada es estadísticamente significativa (no atribuible al azar).' },
      { nombre: 'MAD (Nigrini)', descripcion: 'Mide la magnitud promedio de la desviación por dígito, clasificada en 4 niveles de conformidad.' },
      { nombre: 'Montos Más Atípicos', descripcion: 'Lista los montos individuales que más contribuyen a la desviación general — punto de partida para la revisión manual.' },
    ],
    limitaciones:
      'Requiere un mínimo de 50-100 montos para ser estadísticamente confiable, y funciona mejor sobre conjuntos de datos "naturales" (montos que emergen de transacciones reales, no de rangos artificialmente acotados — ej. precios fijos de catálogo violan Benford sin que haya fraude). Un resultado "No Conforme" señala dónde mirar, no confirma manipulación.',
  },
  anomaly: {
    objetivo:
      'Detectar transacciones estadísticamente atípicas sin definir reglas de antemano — útil quando el patrón de riesgo no se conoce todavía o es multivariado (combinación inusual de variables, no una sola fuera de rango).',
    metodologia:
      'Isolation Forest (aprendizaje no supervisado, scikit-learn) — aísla cada registro según cuántas particiones aleatorias hacen falta para separarlo del resto; los que se aíslan más rápido son más anómalos. Se complementa con Z-scores individuales por variable para explicar POR QUÉ cada registro fue marcado.',
    normativa: 'NIA 520 (procedimientos analíticos sustantivos), enfoque de auditoría basado en datos (Data-Driven Audit)',
    pruebas: [
      { nombre: 'Isolation Forest', descripcion: 'Modelo de ensamble que asigna un puntaje de anomalía a cada registro considerando TODAS las variables numéricas seleccionadas en conjunto.' },
      { nombre: 'Puntajes Z por variable', descripcion: 'Para cada anomalía detectada, muestra qué variable(s) específica(s) causaron la desviación — ej. "monto" muy alto en horario "madrugada".' },
    ],
    limitaciones:
      'Es un modelo estadístico, no conoce el contexto de negocio — una anomalía puede ser perfectamente legítima (ej. un bono anual real). Requiere que las columnas seleccionadas sean genuinamente numéricas y comparables entre sí. Con menos de 10 registros el modelo no tiene suficiente base para entrenar.',
  },
  sod: {
    objetivo:
      'Detectar usuarios que acumulan permisos incompatibles entre sí sobre los sistemas de la entidad — el mismo usuario con capacidad de ejecutar Y controlar el mismo proceso, sin contrapeso independiente. Es la prueba directa del componente de Actividades de Control de COSO 2013.',
    metodologia:
      'Compara la lista de permisos de cada usuario contra un catálogo curado de pares de funciones incompatibles (ej. crear proveedor + aprobar pago), y adicionalmente marca usuarios que acumulan permisos en 3 o más categorías sensibles aunque ninguna combinación puntual esté en el catálogo.',
    normativa: 'COSO 2013 — Principios 10 y 11 (Actividades de Control), NIA 315 (entendimiento de controles), IIA GTAG 8 (Auditing Application Controls)',
    pruebas: [
      { nombre: 'Conflictos del catálogo', descripcion: 'Un hallazgo por cada par de funciones incompatibles detectado (ej. Crear Proveedor + Aprobar Pago, Registrar Asientos + Conciliar Banco, Procesar Nómina + Aprobar Nómina).' },
      { nombre: 'Concentración de Accesos Sensibles', descripcion: 'Usuarios con permisos en 3 o más categorías sensibles distintas — riesgo de control total sin contrapeso, aunque ninguna combinación puntual esté catalogada.' },
    ],
    limitaciones:
      'El catálogo de conflictos es un punto de partida basado en funciones típicas — cada organización debería revisar y ampliar la lista según su propia matriz de riesgos. El emparejamiento de permisos es por texto (palabras clave), así que nombres de permiso muy distintos a los esperados pueden no matchear — revisar el mapeo de columnas antes de concluir "sin hallazgos".',
  },
  vendor_master: {
    objetivo:
      'Verificar la integridad del maestro de proveedores como tal — no de las transacciones que se le imputan — para detectar proveedores duplicados bajo identidades distintas, reactivaciones sin autorización, y proveedores cuya identidad no se puede verificar con los datos registrados.',
    metodologia:
      'Compara cada proveedor contra el resto del maestro por NIT/RUC, cuenta bancaria y dirección normalizados (sin acentos, mayúsculas, ni puntuación), y evalúa el estado de cada proveedor contra su fecha de última actividad.',
    normativa: 'ACFE — billing schemes (esquemas de facturación fraudulenta), COSO 2013 Principio 12 (implementación de actividades de control)',
    pruebas: [
      { nombre: 'NIT/RUC Duplicado', descripcion: 'Mismo NIT/RUC registrado bajo más de un proveedor — posible fraccionamiento o encubrimiento de identidad. Señal crítica.' },
      { nombre: 'Cuenta Bancaria Duplicada', descripcion: 'Misma cuenta bancaria registrada para más de un proveedor — señal aún más fuerte que el NIT de que un mismo beneficiario controla proveedores "independientes".' },
      { nombre: 'Dirección Duplicada', descripcion: 'Misma dirección para más de un proveedor — señal más débil (puede ser un edificio/centro comercial compartido legítimamente), amerita revisión pero no es concluyente por sí sola.' },
      { nombre: 'Proveedor Inactivo con Actividad Reciente', descripcion: 'Proveedor marcado como inactivo/suspendido con movimientos recientes — verificar quién autorizó la reactivación.' },
      { nombre: 'Identidad Débil', descripcion: 'Proveedor con nombre genérico/sospechoso, o sin NIT ni dirección — no hay forma de verificar que existe legalmente con los datos del maestro.' },
    ],
    limitaciones:
      'El emparejamiento de NIT/cuenta/dirección es textual (normalizado) — errores de digitación no detectados como "el mismo valor" pueden esconder un duplicado real. Una dirección compartida NO es prueba de fraude por sí sola. Requiere que el archivo sea el MAESTRO de proveedores (un registro por proveedor), no el historial de transacciones — para eso está el motor de Cuentas por Pagar (AP).',
  },
  related_parties: {
    objetivo:
      'Detectar transacciones con una parte relacionada (accionista, director, familiar, filial o empleado propio) que no fue revelada como tal — el conflicto de interés más citado en el Reporte ACFE a las Naciones, y área de riesgo explícita bajo NIA 550.',
    metodologia:
      'Único motor CAATs que cruza DOS fuentes de datos: las transacciones a analizar contra un registro separado de partes relacionadas (que incluye accionistas, directores, familiares, filiales, y la nómina propia como filas con relación "Empleado"). El cruce se hace primero por NIT/RUC exacto (señal fuerte) y, si no hay NIT, por coincidencia de nombre (señal más débil, sujeta a falsos positivos).',
    normativa: 'NIA 550 (Partes Relacionadas), ACFE Report to the Nations 2024 (conflicto de interés — categoría más común de esquema de corrupción)',
    pruebas: [
      { nombre: 'Coincidencia por NIT/RUC', descripcion: 'Transacción cuya contraparte comparte NIT/RUC exacto con una parte relacionada registrada — evidencia fuerte, no depende de que los nombres coincidan.' },
      { nombre: 'Coincidencia por Nombre', descripcion: 'Transacción cuya contraparte coincide por nombre (sin NIT que lo confirme) con una parte relacionada — señal más débil, requiere confirmación manual.' },
      { nombre: 'Empleado como Contraparte', descripcion: 'Un empleado de la nómina propia aparece como proveedor o cliente — el escenario específico de "participación oculta" que más preocupa en auditoría de conflicto de interés.' },
    ],
    limitaciones:
      'La calidad del resultado depende por completo de qué tan completo esté el registro de partes relacionadas que se sube — el motor no puede detectar una parte relacionada que nunca se registró. El match por nombre es especialmente propenso a falsos positivos con nombres comunes; siempre revisar manualmente antes de concluir que hay una transacción no revelada.',
  },
  expenses: {
    objetivo:
      'Detectar patrones de riesgo en el ciclo de gastos de representación y viáticos — fraccionamiento para evitar aprobación, gastos duplicados, y concentración desproporcionada en un solo empleado. Uno de los esquemas de fraude ocupacional más comunes según ACFE (expense reimbursement schemes).',
    metodologia:
      'Análisis basado en reglas sobre el 100% de los gastos cargados: umbral de aprobación configurable (según la política de la entidad), agrupación por empleado/semana para detectar fraccionamiento, y comparación de fecha contra fin de semana.',
    normativa: 'ACFE — expense reimbursement schemes, COSO 2013 (actividades de control sobre gastos)',
    pruebas: [
      { nombre: 'Gasto Cerca del Umbral', descripcion: 'Gastos individuales dentro del 10% por debajo del umbral de aprobación — patrón típico de ajuste deliberado.' },
      { nombre: 'Fraccionamiento de Gastos', descripcion: 'Mismo empleado con varios gastos en la misma semana, cada uno bajo el umbral, que suman por encima de él.' },
      { nombre: 'Gastos en Fin de Semana', descripcion: 'Gastos registrados sábado o domingo — requieren justificación de negocio (viaje, evento con cliente).' },
      { nombre: 'Gastos Duplicados', descripcion: 'Mismo empleado, monto y fecha repetidos — posible reembolso doble.' },
      { nombre: 'Concentración por Empleado', descripcion: 'Los 3 empleados con más gasto concentran más del 50% del total — puede ser legítimo (rol ejecutivo/comercial) pero amerita revisión.' },
    ],
    limitaciones:
      'El umbral de aprobación usado por defecto ($100) es un valor de referencia — para un resultado preciso debe ajustarse a la política real de la entidad. Un empleado con más viajes/gastos legítimos (ej. ventas, dirección) concentrará naturalmente más gasto sin que eso implique fraude — el hallazgo de concentración es un punto de partida, no una conclusión.',
  },
  revenue_cutoff: {
    objetivo:
      'Detectar reconocimiento de ingresos antes de la entrega real del bien o servicio, y patrones de "channel stuffing" (empujar ventas artificialmente antes del cierre) — una de las áreas de riesgo de fraude presuntas por defecto bajo NIA 240.',
    metodologia:
      'El cierre de período se infiere como la fecha más reciente del universo de facturas cargado — cargue exactamente el período que quiere evaluar. Cruza cada factura emitida en los últimos días del período contra su fecha de guía de despacho/entrega, y compara el promedio diario de facturación de esos últimos días contra el resto del período.',
    normativa: 'NIIF 15 (Reconocimiento de Ingresos), NIA 240 (fraude — área de riesgo presunta)',
    pruebas: [
      { nombre: 'Factura sin Entrega Confirmada', descripcion: 'Facturas cerca del cierre sin guía de despacho registrada, o con entrega varios días después de la factura.' },
      { nombre: 'Concentración de Facturación al Cierre', descripcion: 'El promedio diario de facturación en los últimos días del período es anormalmente más alto que el resto — patrón de "channel stuffing".' },
    ],
    limitaciones:
      'El cierre de período se infiere de los datos cargados (la fecha más reciente) — si el archivo no cubre exactamente el período a evaluar, el resultado no es confiable. Sin fecha de entrega cargada, la prueba de corte queda incompleta (solo señala qué facturas revisar manualmente).',
  },
  bid_rigging: {
    objetivo:
      'Detectar patrones de colusión entre proveedores en procesos de licitación — precios anormalmente uniformes, ofertas perdedoras diseñadas para no competir realmente ("cover bidding"), y proveedores con una tasa de adjudicación desproporcionada.',
    metodologia:
      'Agrupa las ofertas por proceso de licitación y calcula el coeficiente de variación de los montos ofertados, la cercanía de cada oferta perdedora a la ganadora, y la tasa histórica de adjudicación por proveedor frente a cuántas veces participa.',
    normativa: 'ACFE — bid rigging schemes, OCDE Guidelines for Fighting Bid Rigging in Public Procurement',
    pruebas: [
      { nombre: 'Uniformidad de Precios', descripcion: 'Ofertas de un mismo proceso con variación menor al 3% entre sí — señal fuerte de acuerdo previo de precios.' },
      { nombre: 'Ofertas Perdedoras Cercanas al Ganador', descripcion: 'Ofertas perdedoras dentro del 5% por encima de la ganadora — patrón de "cover bidding".' },
      { nombre: 'Tasa de Adjudicación Desproporcionada', descripcion: 'Proveedor adjudicado en el 50% o más de las licitaciones en que participa (con 3+ participaciones).' },
    ],
    limitaciones:
      'El fraude en licitaciones no siempre deja un rastro numérico detectable — un proceso genuinamente competitivo entre pocos proveedores especializados puede producir precios similares sin que exista colusión. Cada hallazgo requiere investigación adicional (relaciones societarias entre oferentes, patrones a través de múltiples entidades contratantes) antes de concluir.',
  },
  ar_aging: {
    objetivo:
      'Calcular la antigüedad de las cuentas por cobrar por cliente, y detectar notas de crédito de monto alto emitidas cerca del cierre de período (posible reversión de ventas registradas para maquillar el cierre).',
    metodologia:
      'Calcula días vencidos de cada factura contra la fecha de vencimiento más reciente del universo cargado, clasifica en 4 rangos de antigüedad (0-30/31-60/61-90/90+ días), y evalúa concentración de saldo por cliente.',
    normativa: 'NIA 540 (estimaciones contables — deterioro de cuentas por cobrar), NIA 315',
    pruebas: [
      { nombre: 'Saldo Severamente Vencido', descripcion: 'Facturas con más de 90 días de vencidas — evaluar deterioro/estimación de incobrables.' },
      { nombre: 'Concentración por Cliente', descripcion: 'Los 3 clientes con mayor saldo concentran más del 50% de las cuentas por cobrar totales.' },
      { nombre: 'Notas de Crédito Cerca del Cierre', descripcion: 'Notas de crédito emitidas en los últimos 15 días con datos cargados — revisar si reversan ventas de cierre.' },
    ],
    limitaciones:
      'La antigüedad se calcula contra la fecha de vencimiento más reciente del archivo cargado, no contra la fecha real de hoy — cargue el universo completo de CxC vigente a la fecha de corte que quiere evaluar. La prueba de notas de crédito no vincula automáticamente cada nota contra su factura original (requiere ese cruce manual si el archivo no lo trae).',
  },
  fixed_assets: {
    objetivo:
      'Verificar existencia y depreciación de activos fijos — recalcula la depreciación esperada (línea recta) y la compara contra la registrada, detecta activos totalmente depreciados que siguen en uso, y activos sin verificación física reciente.',
    metodologia:
      'Depreciación línea recta: (años transcurridos ÷ vida útil) × costo, comparado contra la depreciación acumulada registrada. La fecha de referencia se infiere como la adquisición más reciente del universo cargado.',
    normativa: 'NIA 500 (evidencia de auditoría — existencia), NIC 16 (Propiedad, Planta y Equipo)',
    pruebas: [
      { nombre: 'Depreciación Registrada vs. Esperada', descripcion: 'Activos donde la depreciación registrada difiere de la esperada (línea recta) en más del 10% del costo.' },
      { nombre: 'Totalmente Depreciado y Aún Activo', descripcion: 'Activos con 98%+ del costo depreciado pero marcados como en uso — evaluar baja, revaluación o extensión formal de vida útil.' },
      { nombre: 'Sin Verificación Física Reciente', descripcion: 'Activos sin conteo físico en los últimos 2 años (o nunca verificados) — riesgo de existencia.' },
    ],
    limitaciones:
      'Asume depreciación en línea recta — si la entidad usa otro método (unidades producidas, saldos decrecientes), la comparación no es válida sin ajustar el cálculo. La fecha de referencia se infiere de los datos cargados, no es necesariamente la fecha de cierre real del período auditado.',
  },
  structuring: {
    objetivo:
      'Detectar el patrón transaccional de "pitufeo" (structuring/smurfing) — fraccionamiento deliberado de depósitos o transacciones en montos menores al umbral de reporte regulatorio, típico de la Fase de Colocación del lavado de activos.',
    metodologia:
      'Identifica transacciones individuales justo bajo el umbral de reporte, y agrupa transacciones del mismo titular en ventanas cortas de tiempo (por defecto 3 días) para detectar si, sumadas, superan el umbral.',
    normativa: 'GAFI Recomendación 20 (Reporte de Operaciones Sospechosas), LCDA / NRP-36 (BCR/SSF El Salvador)',
    pruebas: [
      { nombre: 'Transacción Cerca del Umbral', descripcion: 'Transacciones individuales dentro del 10% por debajo del umbral de reporte.' },
      { nombre: 'Patrón de Fraccionamiento', descripcion: 'Mismo titular con 2+ transacciones en una ventana corta que suman igual o más que el umbral — firma clásica del pitufeo.' },
    ],
    limitaciones:
      'El umbral de reporte usado por defecto ($10,000) es un valor de referencia — debe ajustarse al umbral regulatorio real aplicable (ej. el de la Unidad de Investigación Financiera). Un patrón detectado es un indicio para investigar, no una confirmación de lavado de activos.',
  },
  missing_trader: {
    objetivo:
      'Detectar la firma transaccional del fraude "Missing Trader" (fraude carrusel de IVA) — un proveedor que concentra un volumen de transacciones alto en una ventana corta de actividad, aparece, factura fuerte, y deja de operar.',
    metodologia:
      'Calcula por proveedor su ventana de actividad (días entre primera y última transacción) y volumen total. Marca proveedores con actividad concentrada en pocos días Y volumen entre los más altos del universo cargado; cuando hay datos de identidad, cruza con NIT/dirección ausente.',
    normativa: 'GAFI, doctrina europea de fraude carrusel de IVA (aplicable por analogía)',
    pruebas: [
      { nombre: 'Actividad Concentrada', descripcion: 'Proveedor con actividad en 30 días o menos y volumen entre el 25% más alto del universo — patrón de aparece/factura/desaparece.' },
      { nombre: 'Identidad Débil con Monto Alto', descripcion: 'Proveedor sin NIT ni dirección registrada, con monto total igual o superior a la mediana.' },
    ],
    limitaciones:
      'NO puede confirmar que el IVA facturado no fue enterado a la administración tributaria — ese dato no está disponible en un archivo de transacciones internas, requiere cruce con DGII. Señala el patrón transaccional consistente con el esquema, no una confirmación de fraude.',
  },
  tax_haven: {
    objetivo:
      'Analizar concentración de transacciones hacia jurisdicciones de baja o nula tributación, útil para detectar esquemas de traslado de beneficios hacia sociedades instrumentales o filiales.',
    metodologia:
      'Compara la jurisdicción de cada transacción contra un catálogo de referencia de jurisdicciones citadas de forma recurrente en literatura OCDE/BEPS, y calcula qué porcentaje del monto total transaccionado se dirige a esas jurisdicciones.',
    normativa: 'Art. 199-A Código Tributario (Precios de Transferencia), OCDE/BEPS',
    pruebas: [
      { nombre: 'Transacciones a Jurisdicción de Baja Tributación', descripcion: 'Transacciones individuales hacia una jurisdicción del catálogo de referencia.' },
      { nombre: 'Alta Concentración en Jurisdicciones de Riesgo', descripcion: 'Más del 15% del monto total transaccionado se dirige a jurisdicciones de baja tributación.' },
    ],
    limitaciones:
      'El catálogo de jurisdicciones es una REFERENCIA GENERAL, NO la lista oficial vigente de "paraísos fiscales" o "sujetos a régimen fiscal preferente" que publica el Ministerio de Hacienda/DGII de El Salvador — esa lista oficial debe verificarse aparte y puede diferir. Este motor es un punto de partida para la revisión, no una determinación legal de precios de transferencia.',
  },
};
