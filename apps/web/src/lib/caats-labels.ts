// ─── Traducción de campos CAATs (backend en inglés → UI en español) ──────────
// Los analizadores en apps/ai-service/app/services/caats/*.py devuelven JSON
// con claves en inglés (dataclasses Python) — este archivo es la ÚNICA fuente
// de traducción, para no repetir el diccionario en cada componente.

export const FIELD_LABELS: Record<string, string> = {
  // Campos escalares comunes
  total_entries: 'Total de Asientos',
  total_amount: 'Monto Total',
  period_start: 'Inicio del Período',
  period_end: 'Fin del Período',
  findings_count: 'Cantidad de Hallazgos',
  high_risk_count: 'Hallazgos de Alto Riesgo',
  risk_score: 'Puntaje de Riesgo',
  summary: 'Resumen',
  findings: 'Hallazgos',
  // Sanciones (Motor #18)
  total_screened: 'Nombres Analizados',
  matches_found: 'Coincidencias Encontradas',
  // AP
  total_invoices: 'Total de Facturas',
  vendor_count: 'Cantidad de Proveedores',
  vendor_concentration: 'Concentración por Proveedor',
  vendor_id: 'Proveedor',
  vendor_name: 'Nombre del Proveedor',
  pct_of_total: '% del Total',
  // Payroll
  total_employees: 'Total de Empleados',
  total_payroll: 'Total de Nómina',
  period: 'Período',
  pay_distribution: 'Distribución Salarial',
  by_department: 'Por Departamento',
  // Benford
  total_records: 'Total de Registros',
  valid_records: 'Registros Válidos',
  chi2_statistic: 'Estadístico Chi-Cuadrado',
  chi2_pvalue: 'Valor p (Chi-Cuadrado)',
  mad: 'Desviación Absoluta Media (MAD)',
  conformity: 'Conformidad con Ley de Benford',
  digits: 'Distribución de Dígitos',
  digit: 'Dígito',
  observed_pct: 'Observado (%)',
  expected_pct: 'Esperado (%)',
  deviation_pct: 'Desviación (%)',
  is_anomalous: 'Anómalo',
  top_anomalous_amounts: 'Montos Más Atípicos',
  interpretation: 'Interpretación',
  // Anomaly (ML)
  anomaly_count: 'Cantidad de Anomalías',
  anomaly_rate_pct: 'Tasa de Anomalías (%)',
  top_anomalies: 'Principales Anomalías',
  feature_stats: 'Estadísticas de Variables',
  anomaly_score: 'Puntaje de Anomalía',
  z_scores: 'Puntajes Z',
  flags: 'Señales',
  record: 'Registro',
  index: 'Índice',
  // Finding (GL/AP/Payroll)
  test_name: 'Prueba',
  risk_level: 'Nivel de Riesgo',
  record_count: 'Registros',
  description: 'Descripción',
  sample_records: 'Registros de Muestra',
  // Registros de muestra (campos crudos, GL/AP/Payroll)
  date: 'Fecha', account: 'Cuenta', amount: 'Monto', debit: 'Debe', credit: 'Haber',
  reference: 'Referencia', cost_center: 'Centro de Costo', user: 'Usuario', time: 'Hora',
  invoice_number: 'N° Factura', invoice_date: 'Fecha de Factura', payment_date: 'Fecha de Pago',
  employee_id: 'ID Empleado', employee_name: 'Nombre', gross_pay: 'Salario Bruto', net_pay: 'Salario Neto',
  department: 'Departamento', position: 'Cargo', approved_by: 'Aprobado por', bank_account: 'Cuenta Bancaria',
  // Nombres de campo "default" del backend (cuando corre con datos de muestra,
  // sin field_mapping — ver apps/ai-service/.../caats/*.py)
  account_code: 'Cuenta', posted_by: 'Registrado por', days_worked: 'Días Trabajados',
  hour: 'Hora', day_of_week: 'Día de la Semana', user_transactions: 'Transacciones del Usuario',
  invoice_id: 'N° Factura',
  // Estadísticas
  mean: 'Media', median: 'Mediana', std: 'Desv. Estándar', min: 'Mínimo', max: 'Máximo',
  p25: 'Percentil 25', p75: 'Percentil 75', p95: 'Percentil 95', count: 'Cantidad', sum: 'Suma',
  // SoD (Segregación de Funciones)
  total_users: 'Usuarios Analizados', total_assignments: 'Permisos Asignados',
  conflict_count: 'Usuarios con Conflicto', usuario: 'Usuario', permission: 'Permiso',
  user_name: 'Nombre', conflicto: 'Conflicto', permisos_en_conflicto: 'Permisos en Conflicto',
  categorias_sensibles: 'Categorías Sensibles', total_permisos: 'Total de Permisos',
  conflictos: 'Conflictos', total_conflictos: 'Cantidad de Conflictos',
  // Maestro de Proveedores
  total_vendors: 'Proveedores Analizados', active_count: 'Proveedores Activos',
  nit: 'NIT / RUC', cuenta_bancaria: 'Cuenta Bancaria', direccion: 'Dirección',
  proveedores: 'Proveedores Involucrados', tax_id: 'NIT / RUC', address: 'Dirección',
  status: 'Estado', last_activity_date: 'Última Actividad',
  // Partes Relacionadas
  total_transactions: 'Transacciones Analizadas', total_related_parties: 'Partes Relacionadas Registradas',
  matched_transaction_count: 'Transacciones Vinculadas', matched_amount: 'Monto Vinculado',
  exposure_by_party: 'Exposición por Parte Relacionada', parte_relacionada: 'Parte Relacionada',
  relacion: 'Relación', transacciones: 'Transacciones', monto_total: 'Monto Total',
  party_name: 'Nombre de la Parte Relacionada', relationship: 'Relación',
  // Gastos de Representación (T&E)
  total_expenses: 'Gastos Analizados', employee_count: 'Empleados con Gastos',
  employee_concentration: 'Concentración por Empleado', empleado: 'Empleado',
  pct_del_total: '% del Total', category: 'Categoría',
  semana: 'Semana', suma_gastos: 'Suma de Gastos', cantidad_gastos: 'Cantidad de Gastos',
  // Corte de Ingresos
  customer_name: 'Nombre del Cliente', delivery_date: 'Fecha de Entrega', daily_amounts: 'Montos Diarios',
  // Licitación Colusoria
  total_bids: 'Ofertas Analizadas', total_tenders: 'Licitaciones Analizadas', bidder_count: 'Oferentes',
  bidder_win_rate: 'Tasa de Adjudicación por Proveedor', licitacion: 'Licitación', num_ofertas: 'N° de Ofertas',
  monto_promedio: 'Monto Promedio', coef_variacion_pct: 'Coef. de Variación (%)', oferta: 'Oferta',
  oferta_ganadora: 'Oferta Ganadora', diferencia_pct: 'Diferencia (%)', proveedor: 'Proveedor',
  participaciones: 'Participaciones', adjudicaciones: 'Adjudicaciones', tasa_adjudicacion_pct: 'Tasa de Adjudicación (%)',
  tender_id: 'Licitación', bidder_name: 'Oferente', is_winner: '¿Ganador?',
  // Antigüedad de CxC
  total_outstanding: 'Saldo Total Pendiente', customer_count: 'Clientes con Saldo', aging_buckets: 'Antigüedad de Saldos',
  rango: 'Rango', facturas: 'Facturas', monto: 'Monto', cliente: 'Cliente', saldo: 'Saldo', due_date: 'Fecha de Vencimiento',
  is_credit_note: '¿Es Nota de Crédito?',
  // Activo Fijo
  total_assets: 'Activos Analizados', total_cost: 'Costo Total', total_accumulated_depreciation: 'Depreciación Acumulada Total',
  asset_id: 'ID del Activo', asset_name: 'Nombre del Activo', depreciacion_registrada: 'Depreciación Registrada',
  depreciacion_esperada: 'Depreciación Esperada', acquisition_date: 'Fecha de Adquisición', cost: 'Costo',
  useful_life_years: 'Vida Útil (años)', accumulated_depreciation: 'Depreciación Acumulada',
  last_physical_check_date: 'Última Verificación Física',
  // Pitufeo / Smurfing
  account_count: 'Titulares Analizados', account_holder: 'Titular', ventana: 'Ventana', suma: 'Suma', cantidad: 'Cantidad',
  // Missing Trader
  vendor_activity: 'Actividad por Proveedor', dias_actividad: 'Días de Actividad',
  primera_transaccion: 'Primera Transacción', ultima_transaccion: 'Última Transacción',
  // Jurisdicciones de Baja Tributación
  flagged_amount: 'Monto en Jurisdicciones de Riesgo', flagged_pct: '% en Jurisdicciones de Riesgo',
  exposure_by_jurisdiction: 'Exposición por Jurisdicción', jurisdiccion: 'Jurisdicción', jurisdiction: 'País / Jurisdicción',
  // Suite de Validación DTE
  total_dtes: 'Documentos DTE Analizados', valid_structure_count: 'Con Estructura Válida',
  tipo_breakdown: 'Documentos por Tipo de DTE', tipo: 'Tipo de Documento', codigo: 'Código',
  documento: 'Documento', error: 'Error', errores: 'Errores', total_errores: 'Total de Errores',
  estado: 'Estado de Hacienda', observaciones: 'Observaciones', problema: 'Problema',
  tipoDte: 'Tipo de DTE', codigoGeneracion: 'Código de Generación', documentos: 'Documentos',
  establecimiento_punto_venta: 'Establecimiento / Punto de Venta',
  correlativos_faltantes: 'Correlativos Faltantes', total_faltantes: 'Total Faltante',
};

export const TEST_NAME_LABELS: Record<string, string> = {
  ROUND_AMOUNTS: 'Montos Redondos',
  END_OF_PERIOD: 'Asientos de Fin de Período',
  DUPLICATE_AMOUNT_USER: 'Monto Duplicado por Usuario',
  WEEKEND_ENTRIES: 'Asientos en Fin de Semana',
  OFF_HOURS_ENTRIES: 'Asientos Fuera de Horario Laboral',
  HIGH_VOLUME_USER: 'Usuario de Alto Volumen',
  DUPLICATE_INVOICES: 'Facturas Duplicadas',
  INVOICE_SPLITTING: 'Fraccionamiento de Facturas',
  GHOST_VENDORS: 'Proveedores Fantasma',
  EARLY_PAYMENT: 'Pago Anticipado Inusual',
  LATE_PAYMENT: 'Pago Atrasado',
  VENDOR_CONCENTRATION: 'Concentración de Proveedores',
  GHOST_EMPLOYEES: 'Empleados Fantasma',
  PAY_OUTLIERS: 'Pagos Atípicos',
  NET_EXCEEDS_GROSS: 'Neto Excede al Bruto',
  SHARED_BANK_ACCOUNTS: 'Cuentas Bancarias Compartidas',
  APPROVER_CONCENTRATION: 'Concentración de Aprobadores',
  // SoD (Segregación de Funciones) — test_name es dinámico ("SOD_" + nombre
  // del par incompatible), se mapea 1:1 contra los pares definidos en
  // apps/ai-service/app/services/caats/sod_analysis.py::INCOMPATIBLE_PAIRS
  'SOD_Crear proveedor + Aprobar pago': 'Crear Proveedor + Aprobar Pago',
  'SOD_Crear cliente + Aplicar nota de crédito': 'Crear Cliente + Aplicar Nota de Crédito',
  'SOD_Registrar asientos + Conciliar banco': 'Registrar Asientos + Conciliar Banco',
  'SOD_Crear orden de compra + Recibir/Aprobar la misma orden': 'Crear Orden de Compra + Recibir/Aprobar la Misma Orden',
  'SOD_Procesar nómina + Aprobar nómina': 'Procesar Nómina + Aprobar Nómina',
  'SOD_Administración de usuarios + Aprobación de transacciones': 'Administración de Usuarios + Aprobación de Transacciones',
  ACCESS_CONCENTRATION: 'Concentración de Accesos Sensibles',
  // Maestro de Proveedores
  DUPLICATE_TAX_ID: 'NIT/RUC Duplicado',
  DUPLICATE_BANK_ACCOUNT: 'Cuenta Bancaria Duplicada',
  DUPLICATE_ADDRESS: 'Dirección Duplicada',
  INACTIVE_WITH_RECENT_ACTIVITY: 'Proveedor Inactivo con Actividad Reciente',
  WEAK_IDENTITY: 'Identidad Débil del Proveedor',
  // Partes Relacionadas
  RELATED_PARTY_MATCH_TAX_ID: 'Transacción con Parte Relacionada (por NIT)',
  RELATED_PARTY_MATCH_NAME: 'Transacción con Parte Relacionada (por Nombre)',
  EMPLOYEE_AS_COUNTERPARTY: 'Empleado como Contraparte',
  // Gastos de Representación (T&E)
  NEAR_APPROVAL_THRESHOLD: 'Gasto Cerca del Umbral de Aprobación',
  SPLIT_EXPENSES: 'Fraccionamiento de Gastos',
  WEEKEND_EXPENSES: 'Gastos en Fin de Semana',
  DUPLICATE_EXPENSES: 'Gastos Duplicados',
  EMPLOYEE_CONCENTRATION: 'Concentración en un Empleado',
  // Corte de Ingresos
  CUTOFF_DELIVERY_MISMATCH: 'Corte — Factura sin Entrega Confirmada',
  CUTOFF_NO_DELIVERY_DATA: 'Corte — Sin Datos de Entrega',
  CUTOFF_CONCENTRATION: 'Concentración de Facturación al Cierre',
  // Licitación Colusoria
  BID_UNIFORMITY: 'Uniformidad de Precios',
  CLOSE_LOSING_BIDS: 'Ofertas Perdedoras Cercanas al Ganador',
  DISPROPORTIONATE_WIN_RATE: 'Tasa de Adjudicación Desproporcionada',
  // Antigüedad de CxC
  SEVERELY_OVERDUE: 'Saldo Severamente Vencido (90+ días)',
  CUSTOMER_CONCENTRATION: 'Concentración por Cliente',
  POST_PERIOD_CREDIT_NOTES: 'Notas de Crédito Cerca del Cierre',
  // Activo Fijo
  DEPRECIATION_MISMATCH: 'Depreciación Registrada vs. Esperada',
  FULLY_DEPRECIATED_STILL_ACTIVE: 'Totalmente Depreciado y Aún Activo',
  STALE_PHYSICAL_CHECK: 'Sin Verificación Física Reciente',
  // Pitufeo / Smurfing
  NEAR_REPORTING_THRESHOLD: 'Transacción Cerca del Umbral de Reporte',
  STRUCTURING_PATTERN: 'Patrón de Fraccionamiento (Pitufeo)',
  // Missing Trader
  BURST_ACTIVITY: 'Actividad Concentrada (Missing Trader)',
  WEAK_IDENTITY_HIGH_VALUE: 'Identidad Débil con Monto Alto',
  // Jurisdicciones de Baja Tributación
  LOW_TAX_JURISDICTION_TRANSACTIONS: 'Transacciones a Jurisdicción de Baja Tributación',
  HIGH_HAVEN_CONCENTRATION: 'Alta Concentración en Jurisdicciones de Riesgo',
  // Suite de Validación DTE
  STRUCTURAL_SCHEMA: 'Estructura Inválida (Esquema Oficial MH)',
  UNSUPPORTED_DTE_TYPE: 'Tipo de DTE No Soportado por el Validador',
  MISSING_SELLO: 'Sin Sello de Recepción de Hacienda',
  REJECTED_OR_OBSERVED: 'Rechazado, Invalidado u Observado por Hacienda',
  SIGNATURE_INTEGRITY: 'Firma Electrónica Ausente o Alterada',
  DUPLICATE_CODIGO_GENERACION: 'Código de Generación Duplicado',
  CORRELATIVO_GAP: 'Brecha en la Numeración Correlativa',
  AMBIENTE_PRUEBAS: 'Documento en Ambiente de Pruebas',
};

export const RISK_LEVEL_LABELS: Record<string, string> = {
  CRITICAL: 'Crítico', HIGH: 'Alto', MEDIUM: 'Medio', LOW: 'Bajo',
};

export const RISK_LEVEL_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  CRITICAL: { bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500' },
  HIGH:     { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  MEDIUM:   { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400' },
  LOW:      { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-400' },
};

export const CONFORMITY_LABELS: Record<string, string> = {
  CLOSE: 'Muy Cercano a Benford', ACCEPTABLE: 'Aceptable',
  SUSPECT: 'Sospechoso', NON_CONFORMING: 'No Conforme',
};

export const CONFORMITY_COLORS: Record<string, { bg: string; text: string }> = {
  CLOSE:          { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  ACCEPTABLE:     { bg: 'bg-blue-50',    text: 'text-blue-700' },
  SUSPECT:        { bg: 'bg-amber-50',   text: 'text-amber-700' },
  NON_CONFORMING: { bg: 'bg-red-50',     text: 'text-red-700' },
};

// ─── Clasificación por área de auditoría (AuditArea en caats-methodology.ts) ──
// Fiscal / Financiero / Operativo son las 3 líneas de encargo del propio
// AuditMind (plantillas "Auditoría Fiscal El Salvador", "Auditoría Financiera
// Externa", "Auditoría Interna NOGAI/IIA"); Transversal marca las técnicas
// genéricas que sirven por igual a las tres.
export const AREA_LABELS: Record<string, string> = {
  fiscal: 'Auditoría Fiscal', financiero: 'Análisis Financiero',
  operativo: 'Análisis Operativo', transversal: 'Transversal (aplica a todas)',
};

export const AREA_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  fiscal:      { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  financiero:  { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  operativo:   { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  transversal: { bg: 'bg-slate-100', text: 'text-slate-700',  dot: 'bg-slate-500' },
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export function testLabel(key: string): string {
  return TEST_NAME_LABELS[key] ?? key.replace(/_/g, ' ');
}

/** Formatea un valor crudo (fecha ISO, número, booleano, string) para mostrar. */
export function formatValue(val: unknown, key?: string): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'Sí' : 'No';
  if (typeof val === 'number') {
    if (key && /pct|percent/.test(key)) return `${val.toLocaleString('es', { maximumFractionDigits: 1 })}%`;
    return val.toLocaleString('es', { maximumFractionDigits: 2 });
  }
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return String(val);
}
