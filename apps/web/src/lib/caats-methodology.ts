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
};
