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
};

export const TEST_NAME_LABELS: Record<string, string> = {
  ROUND_AMOUNTS: 'Montos Redondos',
  END_OF_PERIOD: 'Asientos de Fin de Período',
  DUPLICATE_AMOUNT_USER: 'Monto Duplicado por Usuario',
  WEEKEND_ENTRIES: 'Asientos en Fin de Semana',
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
