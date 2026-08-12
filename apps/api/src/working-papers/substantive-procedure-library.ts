// ─── Biblioteca de Procedimientos Sustantivos por Área — PT-FIN-C-SUST ────────
// Catálogo estático: Procedimiento + Técnica sugeridos para cada área C-01..C-12
// que reutiliza la plantilla genérica PT-FIN-C-SUST. Un botón en S3 ("Cargar
// Procedimientos Sugeridos") busca aquí por el código del papel (paper.code,
// ej. "C-01") y agrega las filas que falten — nunca sobrescribe lo que el
// auditor ya llenó (muestra, población, criterio son propios de cada encargo).
//
// Entradas vacías = área sin biblioteca todavía (el botón avisa y no hace nada).
// Para agregar una nueva área: llenar el arreglo correspondiente siguiendo el
// mismo nivel de detalle que C-01 (procedimientos concretos, no genéricos).

export type Tecnica = 'Inspección' | 'Confirmación' | 'Cálculo' | 'Indagación' | 'Observación' | 'Analítica';

export interface LibraryProcedure {
  procedimiento: string;
  tecnica: Tecnica;
}

export const SUBSTANTIVE_PROCEDURE_LIBRARY: Record<string, LibraryProcedure[]> = {
  // C-01 — Caja y Bancos (NIA 505)
  'C-01': [
    { procedimiento: 'Confirmación bancaria directa a cada banco donde la entidad tuvo cuentas en el período (incluidas cerradas o en cero) — saldo, líneas de crédito, gravámenes y firmantes (NIA 505.7-8)', tecnica: 'Confirmación' },
    { procedimiento: 'Revisión de conciliaciones bancarias de todas las cuentas y seguimiento de cada partida (cheques/depósitos en tránsito, cargos no registrados) al estado de cuenta del período posterior', tecnica: 'Inspección' },
    { procedimiento: 'Corte bancario y prueba de kiting — bank transfer schedule de transferencias entre cuentas propias cercanas al cierre', tecnica: 'Inspección' },
    { procedimiento: 'Arqueo sorpresivo de caja chica / efectivo en caja, en presencia del custodio', tecnica: 'Observación' },
    { procedimiento: 'Revisión de actas de Junta Directiva y contratos de préstamo en busca de gravámenes o pignoraciones no revelados', tecnica: 'Inspección' },
  ],

  // C-03 — Inventarios (NIA 501)
  'C-03': [
    { procedimiento: 'Asistencia a la toma física de inventario: observar el conteo, realizar pruebas de conteo por muestreo y verificar los procedimientos de corte de entradas/salidas (NIA 501.4)', tecnica: 'Observación' },
    { procedimiento: 'Prueba de corte de compras y ventas alrededor de la fecha de cierre — últimas recepciones y despachos antes del corte, primeros después, registrados en el período correcto', tecnica: 'Inspección' },
    { procedimiento: 'Evaluación de la valuación — costo vs. valor neto de realización (NIC 2); revisión de inventario de lento movimiento u obsoleto y razonabilidad de la provisión', tecnica: 'Cálculo' },
    { procedimiento: 'Reconciliación del conteo físico al mayor / kárdex, investigación de diferencias significativas', tecnica: 'Inspección' },
    { procedimiento: 'Confirmación de inventario en poder de terceros — consignación, almacenes de depósito (NIA 501.8)', tecnica: 'Confirmación' },
    { procedimiento: 'Revisión de compromisos de compra/venta y contratos de cobertura si aplica', tecnica: 'Inspección' },
  ],

  // C-04 — Activo Fijo / PP&E (NIA 500 / NIC 16)
  'C-04': [
    { procedimiento: 'Verificación física (existencia) de una muestra de activos significativos', tecnica: 'Inspección' },
    { procedimiento: 'Revisión de adiciones del período — inspeccionar facturas/contratos, verificar autorización y confirmar capitalización correcta vs. gasto (NIC 16)', tecnica: 'Inspección' },
    { procedimiento: 'Revisión de bajas/retiros del período — verificar autorización y recalcular la ganancia o pérdida en venta', tecnica: 'Cálculo' },
    { procedimiento: 'Recálculo de la depreciación (método, vida útil, valor residual) para una muestra de activos', tecnica: 'Cálculo' },
    { procedimiento: 'Evaluación de indicios de deterioro (NIC 36) y revisión del análisis de deterioro de la gerencia si existe', tecnica: 'Analítica' },
    { procedimiento: 'Verificación de gravámenes o hipotecas sobre activos fijos — revisión de escrituras y registros públicos', tecnica: 'Inspección' },
  ],

  // C-05 — Inversiones y Valores (NIA 501 / NIIF 9)
  'C-05': [
    { procedimiento: 'Confirmación directa con custodios o corredores de bolsa de la existencia y titularidad de los valores en cartera', tecnica: 'Confirmación' },
    { procedimiento: 'Verificación de la valuación a valor razonable (cotización de mercado a la fecha de cierre) o costo amortizado según clasificación NIIF 9', tecnica: 'Cálculo' },
    { procedimiento: 'Recálculo de intereses y dividendos devengados', tecnica: 'Cálculo' },
    { procedimiento: 'Revisión de la clasificación (negociable / costo amortizado / otro resultado integral) y su consistencia con el modelo de negocio de la entidad', tecnica: 'Inspección' },
    { procedimiento: 'Evaluación de deterioro de valor — pérdida crediticia esperada (NIIF 9)', tecnica: 'Analítica' },
  ],

  // C-06 — Intangibles y Diferidos (NIC 38)
  'C-06': [
    { procedimiento: 'Revisión de adiciones — verificar si cumplen los criterios de reconocimiento como activo intangible (NIC 38.18) o deben registrarse como gasto del período', tecnica: 'Inspección' },
    { procedimiento: 'Recálculo de la amortización (vida útil definida vs. indefinida)', tecnica: 'Cálculo' },
    { procedimiento: 'Prueba de deterioro anual para intangibles de vida indefinida y plusvalía (NIC 36) — revisión del modelo de flujos descontados de la gerencia', tecnica: 'Analítica' },
    { procedimiento: 'Verificación de la titularidad legal — registros de propiedad intelectual, contratos de licencia', tecnica: 'Inspección' },
    { procedimiento: 'Revisión de costos de desarrollo capitalizados vs. investigación — deben cumplir los 6 criterios de NIC 38.57', tecnica: 'Inspección' },
  ],

  // C-07 — Cuentas por Pagar (NIA 505)
  'C-07': [
    { procedimiento: 'Circularización de proveedores principales y por muestreo — confirmación de saldos (NIA 505)', tecnica: 'Confirmación' },
    { procedimiento: 'Búsqueda de pasivos no registrados: revisar pagos posteriores al cierre y facturas recibidas después, para identificar obligaciones del período no registradas', tecnica: 'Inspección' },
    { procedimiento: 'Prueba de corte de compras — últimas recepciones antes del cierre, registradas en el período correcto', tecnica: 'Inspección' },
    { procedimiento: 'Reconciliación de saldos según proveedor vs. según libros para las partidas no confirmadas', tecnica: 'Inspección' },
    { procedimiento: 'Revisión de partidas antiguas o en disputa', tecnica: 'Indagación' },
  ],

  // C-08 — Obligaciones Bancarias y Financieras (NIA 505)
  'C-08': [
    { procedimiento: 'Confirmación bancaria directa de préstamos y líneas de crédito — saldo, tasa, vencimiento, garantías y covenants (NIA 505.7-8)', tecnica: 'Confirmación' },
    { procedimiento: 'Recálculo de intereses devengados y verificación de la porción corriente vs. no corriente', tecnica: 'Cálculo' },
    { procedimiento: 'Revisión de cumplimiento de covenants financieros a la fecha de cierre y proyectado', tecnica: 'Analítica' },
    { procedimiento: 'Verificación de garantías y colateral otorgado — revisión de contratos y registros públicos', tecnica: 'Inspección' },
    { procedimiento: 'Prueba de clasificación correcta corriente / no corriente según vencimientos contractuales', tecnica: 'Inspección' },
  ],

  // C-09 — Pasivos de Largo Plazo (provisiones NIC 37, arrendamientos NIIF 16)
  'C-09': [
    { procedimiento: 'Revisión de contratos de deuda a largo plazo y confirmación con el acreedor', tecnica: 'Confirmación' },
    { procedimiento: 'Recálculo de provisiones (NIC 37) — evaluación de la base de cálculo y razonabilidad de los supuestos', tecnica: 'Cálculo' },
    { procedimiento: 'Revisión de contratos de arrendamiento y recálculo del pasivo por arrendamiento (NIIF 16) — tasa de descuento, plazo y pagos', tecnica: 'Cálculo' },
    { procedimiento: 'Indagación con el asesor legal sobre litigios y contingencias que puedan requerir provisión', tecnica: 'Indagación' },
    { procedimiento: 'Verificación de la clasificación corriente / no corriente', tecnica: 'Inspección' },
  ],

  // C-10 — Capital, Reservas y Dividendos (NIA 500)
  'C-10': [
    { procedimiento: 'Revisión de actas de Junta de Accionistas / Directiva que autoricen movimientos de capital (aumentos, disminuciones, dividendos)', tecnica: 'Inspección' },
    { procedimiento: 'Confirmación de la estructura accionaria con el Registro de Comercio / libro de accionistas', tecnica: 'Confirmación' },
    { procedimiento: 'Recálculo de la reserva legal y su cumplimiento con el Código de Comercio (El Salvador: 5% anual hasta el 20% del capital social)', tecnica: 'Cálculo' },
    { procedimiento: 'Verificación del cálculo y registro de dividendos decretados y pagados', tecnica: 'Cálculo' },
    { procedimiento: 'Revisión de la conciliación de movimientos patrimoniales del período (Estado de Cambios en el Patrimonio)', tecnica: 'Inspección' },
  ],

  // C-11 — Ingresos (NIA 240 / NIIF 15 / Sec. 23 NIIF-PYMES)
  'C-11': [
    { procedimiento: 'Prueba de corte de ventas — últimas facturas antes del cierre, primeras después; riesgo de fraude por reconocimiento anticipado (NIA 240)', tecnica: 'Inspección' },
    { procedimiento: 'Evaluación del modelo de 5 pasos de NIIF 15 para contratos significativos (identificación del contrato, obligaciones de desempeño, precio de transacción, asignación, reconocimiento)', tecnica: 'Inspección' },
    { procedimiento: 'Procedimientos analíticos sustantivos — relación ingresos vs. costo de ventas, márgenes por línea de negocio vs. período anterior', tecnica: 'Analítica' },
    { procedimiento: 'Revisión de términos de venta inusuales (derecho de devolución, consignación, bonificaciones) que puedan afectar el reconocimiento', tecnica: 'Inspección' },
    { procedimiento: 'Revisión de notas de crédito emitidas después del cierre por ventas del período', tecnica: 'Inspección' },
  ],

  // C-12 — Costos y Gastos
  'C-12': [
    { procedimiento: 'Procedimientos analíticos sustantivos — variación de costos/gastos vs. presupuesto y período anterior, relación con el volumen de actividad', tecnica: 'Analítica' },
    { procedimiento: 'Prueba de corte de gastos — facturas de proveedores de servicios alrededor del cierre', tecnica: 'Inspección' },
    { procedimiento: 'Revisión de la clasificación correcta entre costo de ventas, gastos de operación y gastos financieros', tecnica: 'Inspección' },
    { procedimiento: 'Inspección de una muestra de desembolsos significativos — documentación soporte y autorización', tecnica: 'Inspección' },
    { procedimiento: 'Revisión de gastos con partes relacionadas o inusuales por su naturaleza o monto', tecnica: 'Indagación' },
  ],
};
