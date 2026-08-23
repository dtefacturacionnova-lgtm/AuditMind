// ─── Mapeo de columnas CAATs — compartido entre la pantalla standalone de ────
// Analytics y el panel embebido en el papel de trabajo PT-B4.

export type AnalysisId =
  | 'gl' | 'ap' | 'payroll' | 'benford' | 'anomaly' | 'sod' | 'vendor_master' | 'related_parties' | 'expenses'
  | 'revenue_cutoff' | 'bid_rigging' | 'ar_aging' | 'fixed_assets' | 'structuring' | 'missing_trader' | 'tax_haven';

export interface FieldDef { key: string; label: string; required?: boolean }

// IMPORTANTE: `key` debe ser EXACTO al nombre que cada endpoint de
// apps/ai-service/app/routers/analytics.py lee de `field_mapping` (ej. GL usa
// `fm.get("user", "posted_by")` — la clave del mapeo es "user", "posted_by" es
// solo el default cuando no se manda mapeo). No son necesariamente el mismo
// texto que el nombre de campo final — verificado en vivo contra cada endpoint.
export const FIELD_DEFS: Partial<Record<AnalysisId, FieldDef[]>> = {
  gl: [
    { key: 'amount',      label: 'Monto',                 required: true },
    { key: 'date',        label: 'Fecha' },
    { key: 'user',        label: 'Usuario que registró' },
    { key: 'account',     label: 'Cuenta contable' },
    { key: 'description', label: 'Descripción' },
  ],
  ap: [
    { key: 'amount',         label: 'Monto',                required: true },
    { key: 'vendor_id',      label: 'Proveedor (ID o nombre)' },
    { key: 'vendor_name',    label: 'Nombre del proveedor (detecta fantasmas)' },
    { key: 'invoice_number', label: 'Número de factura' },
    { key: 'date',           label: 'Fecha de factura' },
    { key: 'payment_date',   label: 'Fecha de pago' },
  ],
  payroll: [
    { key: 'gross_pay',     label: 'Salario bruto',        required: true },
    { key: 'employee_id',   label: 'ID de empleado' },
    { key: 'employee_name', label: 'Nombre de empleado' },
    { key: 'net_pay',       label: 'Salario neto' },
    { key: 'department',    label: 'Departamento' },
    { key: 'position',      label: 'Cargo' },
    { key: 'approved_by',   label: 'Aprobado por' },
    { key: 'bank_account',  label: 'Cuenta bancaria' },
  ],
  sod: [
    { key: 'user',       label: 'Usuario (ID o login)',        required: true },
    { key: 'permission', label: 'Permiso / Función asignada',  required: true },
    { key: 'user_name',  label: 'Nombre completo del usuario' },
    { key: 'department', label: 'Departamento' },
  ],
  vendor_master: [
    { key: 'vendor_id',           label: 'ID de Proveedor',        required: true },
    { key: 'vendor_name',         label: 'Nombre del Proveedor',   required: true },
    { key: 'tax_id',              label: 'NIT / RUC' },
    { key: 'bank_account',        label: 'Cuenta Bancaria' },
    { key: 'address',             label: 'Dirección' },
    { key: 'status',              label: 'Estado (Activo/Inactivo)' },
    { key: 'last_activity_date',  label: 'Fecha de Última Actividad' },
  ],
  related_parties: [
    { key: 'vendor_name', label: 'Nombre de la Contraparte (Proveedor/Cliente)', required: true },
    { key: 'amount',      label: 'Monto',                                       required: true },
    { key: 'vendor_id',   label: 'ID de Contraparte' },
    { key: 'tax_id',      label: 'NIT / RUC de la Contraparte' },
    { key: 'date',        label: 'Fecha' },
  ],
  expenses: [
    { key: 'employee_name', label: 'Nombre de Empleado',  required: true },
    { key: 'amount',        label: 'Monto',                required: true },
    { key: 'employee_id',   label: 'ID de Empleado' },
    { key: 'date',          label: 'Fecha del Gasto' },
    { key: 'category',      label: 'Categoría de Gasto' },
    { key: 'approved_by',   label: 'Aprobado por' },
  ],
  revenue_cutoff: [
    { key: 'vendor_name',      label: 'Nombre del Cliente',          required: true },
    { key: 'amount',           label: 'Monto',                       required: true },
    { key: 'date',             label: 'Fecha de Factura',            required: true },
    { key: 'invoice_number',   label: 'Número de Factura' },
    { key: 'delivery_date',    label: 'Fecha de Guía de Despacho/Entrega' },
  ],
  bid_rigging: [
    { key: 'tender_id',   label: 'ID de Licitación / Proceso',  required: true },
    { key: 'vendor_name', label: 'Nombre del Proveedor/Oferente', required: true },
    { key: 'amount',      label: 'Monto Ofertado',              required: true },
    { key: 'is_winner',   label: '¿Ganador? (Sí/No)',           required: true },
  ],
  ar_aging: [
    { key: 'vendor_name',      label: 'Nombre del Cliente',   required: true },
    { key: 'due_date',         label: 'Fecha de Vencimiento', required: true },
    { key: 'amount',           label: 'Monto',                required: true },
    { key: 'invoice_number',   label: 'Número de Factura' },
    { key: 'is_credit_note',   label: '¿Es Nota de Crédito? (Sí/No)' },
    { key: 'date',             label: 'Fecha de Factura/Nota' },
  ],
  fixed_assets: [
    { key: 'asset_name',                label: 'Nombre del Activo',           required: true },
    { key: 'cost',                      label: 'Costo de Adquisición',        required: true },
    { key: 'acquisition_date',          label: 'Fecha de Adquisición',        required: true },
    { key: 'useful_life_years',         label: 'Vida Útil (años)',            required: true },
    { key: 'asset_id',                  label: 'ID del Activo' },
    { key: 'accumulated_depreciation',  label: 'Depreciación Acumulada Registrada' },
    { key: 'status',                    label: 'Estado (Activo/Dado de Baja)' },
    { key: 'last_physical_check_date',  label: 'Fecha de Última Verificación Física' },
  ],
  structuring: [
    { key: 'account_holder', label: 'Titular de la Cuenta/Depositante', required: true },
    { key: 'amount',         label: 'Monto',                            required: true },
    { key: 'date',           label: 'Fecha',                            required: true },
  ],
  missing_trader: [
    { key: 'vendor_name', label: 'Nombre del Proveedor', required: true },
    { key: 'amount',      label: 'Monto',                required: true },
    { key: 'date',        label: 'Fecha',                required: true },
    { key: 'tax_id',      label: 'NIT / RUC' },
    { key: 'address',     label: 'Dirección' },
  ],
  tax_haven: [
    { key: 'vendor_name',   label: 'Nombre de la Contraparte', required: true },
    { key: 'amount',        label: 'Monto',                    required: true },
    { key: 'jurisdiction',  label: 'País / Jurisdicción',       required: true },
    { key: 'date',          label: 'Fecha' },
  ],
};

// ─── Motores que necesitan un SEGUNDO dataset de referencia (hoy solo
// related_parties) — configuración del archivo secundario: label del
// bloque de subida y sus propios campos/alias, independientes del dataset
// principal (mismo mecanismo, dos instancias).
export interface SecondaryDatasetConfig { label: string; fieldDefs: FieldDef[] }

export const SECONDARY_DATASET: Partial<Record<AnalysisId, SecondaryDatasetConfig>> = {
  related_parties: {
    label: 'Registro de Partes Relacionadas / Nómina',
    fieldDefs: [
      { key: 'party_name',    label: 'Nombre de la Parte Relacionada',                       required: true },
      { key: 'relationship',  label: 'Relación (Accionista/Director/Familiar/Empleado/Filial)', required: true },
      { key: 'tax_id',        label: 'NIT / RUC (si está disponible)' },
    ],
  },
};

// Claves iguales a las de FIELD_DEFS (el nombre que field_mapping espera),
// NO necesariamente el nombre "final" del campo — ver nota arriba.
export const FIELD_ALIASES: Record<string, string[]> = {
  amount: ['amount', 'monto', 'importe', 'valor', 'total'],
  date: ['date', 'fecha', 'posting_date', 'fecha_asiento', 'fecha_registro', 'invoice_date', 'fecha_factura'],
  user: ['user', 'posted_by', 'usuario', 'registrado_por', 'creado_por'],
  account: ['account', 'account_code', 'cuenta', 'codigo_cuenta', 'cta'],
  description: ['description', 'descripcion', 'detalle', 'concepto', 'glosa'],
  vendor_id: ['vendor_id', 'vendor', 'proveedor', 'supplier', 'nombre_proveedor'],
  vendor_name: ['vendor_name', 'nombre_proveedor', 'proveedor', 'supplier_name'],
  invoice_number: ['invoice_number', 'invoice_id', 'numero_factura', 'factura', 'no_factura'],
  payment_date: ['payment_date', 'fecha_pago', 'fecha_de_pago'],
  gross_pay: ['gross_pay', 'salary', 'salario', 'sueldo', 'sueldo_bruto', 'salario_bruto'],
  employee_id: ['employee_id', 'id_empleado', 'rut', 'legajo', 'codigo_empleado'],
  employee_name: ['employee_name', 'name', 'nombre', 'nombre_empleado', 'empleado'],
  net_pay: ['net_pay', 'sueldo_neto', 'neto', 'salario_neto'],
  department: ['department', 'departamento', 'depto', 'area', 'gerencia'],
  position: ['position', 'cargo', 'puesto'],
  approved_by: ['approved_by', 'aprobado_por', 'aprobador', 'autorizado_por'],
  bank_account: ['bank_account', 'cuenta_bancaria', 'cuenta', 'numero_cuenta'],
  permission: ['permission', 'permiso', 'role', 'rol', 'funcion', 'función', 'access', 'acceso', 'perfil'],
  user_name: ['user_name', 'nombre_usuario', 'nombre_completo', 'nombre', 'empleado'],
  tax_id: ['tax_id', 'nit', 'ruc', 'rut', 'identificacion_tributaria', 'numero_identificacion'],
  address: ['address', 'direccion', 'domicilio'],
  status: ['status', 'estado', 'estatus'],
  last_activity_date: ['last_activity_date', 'ultima_actividad', 'fecha_ultima_actividad', 'ultimo_movimiento'],
  party_name: ['party_name', 'nombre', 'nombre_completo', 'parte_relacionada', 'nombre_parte'],
  relationship: ['relationship', 'relacion', 'relación', 'tipo_relacion', 'vinculo', 'vínculo'],
  category: ['category', 'categoria', 'categoría', 'tipo_gasto', 'tipo', 'rubro'],
  delivery_date: ['delivery_date', 'fecha_entrega', 'fecha_despacho', 'guia_despacho', 'fecha_guia'],
  tender_id: ['tender_id', 'licitacion', 'proceso', 'id_licitacion', 'id_proceso'],
  is_winner: ['is_winner', 'ganador', 'adjudicado', 'winner'],
  due_date: ['due_date', 'fecha_vencimiento', 'vencimiento', 'fecha_vence'],
  is_credit_note: ['is_credit_note', 'nota_credito', 'nota_de_credito', 'es_nota_credito'],
  asset_id: ['asset_id', 'id_activo', 'codigo_activo'],
  asset_name: ['asset_name', 'nombre_activo', 'descripcion_activo', 'activo'],
  acquisition_date: ['acquisition_date', 'fecha_adquisicion', 'fecha_compra'],
  cost: ['cost', 'costo', 'costo_adquisicion', 'valor_adquisicion'],
  useful_life_years: ['useful_life_years', 'vida_util', 'vida_util_anos', 'años_vida_util'],
  accumulated_depreciation: ['accumulated_depreciation', 'depreciacion_acumulada', 'deprec_acumulada'],
  last_physical_check_date: ['last_physical_check_date', 'ultima_verificacion', 'fecha_verificacion', 'ultimo_conteo'],
  account_holder: ['account_holder', 'titular', 'depositante', 'cuentahabiente', 'cliente'],
  jurisdiction: ['jurisdiction', 'jurisdiccion', 'pais', 'país', 'country'],
};

export function normColName(c: string): string {
  return c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_-]/g, '');
}

export function autoMatchColumn(fieldKey: string, columns: string[]): string {
  const aliases = (FIELD_ALIASES[fieldKey] ?? [fieldKey]).map(normColName);
  // 1) match exacto (ej. columna literal "amount")
  const exact = columns.find(c => aliases.includes(normColName(c)));
  if (exact) return exact;
  // 2) match parcial — columnas reales rara vez son EXACTAS ("Monto_Transaccion"
  // no es igual a "monto", pero lo contiene). Se compara en ambos sentidos por
  // si el alias es más largo que la columna o viceversa.
  const partial = columns.find(c => {
    const nc = normColName(c);
    return aliases.some(a => nc.includes(a) || a.includes(nc));
  });
  return partial ?? '';
}

export function autoDetectNumericColumns(columns: string[], rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];
  const sample = rows.slice(0, Math.min(10, rows.length));
  return columns.filter(c => {
    const values = sample.map(r => r[c]).filter(v => v !== null && v !== undefined && v !== '');
    if (values.length === 0) return false;
    return values.every(v => !Number.isNaN(Number(v)));
  });
}

export interface ParsedFile {
  columns:            string[];
  rows:               Record<string, unknown>[];
  rowCount:           number;
  totalRows:          number;
  truncated:          boolean;
  filename:           string;
  headerRowIndex:     number;
  headerAutoDetected: boolean;
  headerConfidence:   'high' | 'low';
  skippedRows:        string[][];
  rawPreview:         string[][];
}
