'use client';

import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { apiClient } from '@/lib/api-client';
import {
  BarChart3, Play, Loader2, AlertCircle, CheckCircle2,
  TrendingUp, Search, Database, FileSpreadsheet, Cpu,
  ChevronDown, ChevronUp, Info, Upload, FileUp, X, ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Analysis types ───────────────────────────────────────────────────────────

type AnalysisId = 'gl' | 'ap' | 'payroll' | 'benford' | 'anomaly';

interface AnalysisType {
  id:          AnalysisId;
  label:       string;
  description: string;
  icon:        React.ElementType;
  color:       string;
  sampleKey:   string;
}

const ANALYSIS_TYPES: AnalysisType[] = [
  {
    id:          'gl',
    label:       'Libro Mayor (GL)',
    description: 'Detecta asientos fuera de horario, duplicados, montos redondos y entradas de alto riesgo.',
    icon:        Database,
    color:       'bg-blue-500',
    sampleKey:   'gl',
  },
  {
    id:          'ap',
    label:       'Cuentas por Pagar (AP)',
    description: 'Identifica pagos duplicados, proveedores fantasma y transacciones inusuales.',
    icon:        FileSpreadsheet,
    color:       'bg-indigo-500',
    sampleKey:   'ap',
  },
  {
    id:          'payroll',
    label:       'Nómina',
    description: 'Detecta empleados fantasma, pagos excesivos y anomalías en el ciclo de nómina.',
    icon:        TrendingUp,
    color:       'bg-green-500',
    sampleKey:   'payroll',
  },
  {
    id:          'benford',
    label:       "Ley de Benford",
    description: 'Prueba distribución de primeros dígitos para detectar manipulación de montos.',
    icon:        BarChart3,
    color:       'bg-purple-500',
    sampleKey:   'benford',
  },
  {
    id:          'anomaly',
    label:       'Detección de Anomalías (ML)',
    description: 'Isolation Forest para identificar transacciones estadísticamente atípicas.',
    icon:        Cpu,
    color:       'bg-red-500',
    sampleKey:   'anomaly',
  },
];

// ─── Sample data ──────────────────────────────────────────────────────────────

// Nombres de campo alineados EXACTO con los defaults que espera cada analizador
// en apps/ai-service/app/services/caats/*.py (ver ai.service.ts→runCaats, que no
// manda field_mapping — así que estos nombres literales son los que se usan).
// Cada muestra trae al menos un hallazgo plantado y suficientes registros para
// pasar los mínimos estadísticos del backend (Benford ≥50, Anomalía/ML ≥10,
// outliers de nómina >10) — de lo contrario el análisis corre pero no encuentra
// nada, o se rechaza antes de intentarlo.
const SAMPLE_DATA: Record<string, unknown> = {
  gl: {
    records: [
      { date: '2026-01-15', account_code: '5010', description: 'Gastos operacionales', amount: 45000, posted_by: 'jsmith', time: '09:32' },
      { date: '2026-01-15', account_code: '5010', description: 'Gastos operacionales', amount: 45000, posted_by: 'jsmith', time: '09:33' },
      { date: '2026-01-20', account_code: '1010', description: 'Ajuste fin de mes',    amount: 1000000, posted_by: 'admin', time: '23:45' },
      { date: '2026-01-22', account_code: '2030', description: 'Provisión especial',   amount: 500000,  posted_by: 'admin', time: '22:10' },
      { date: '2026-02-01', account_code: '5020', description: 'Servicios profesionales', amount: 75000, posted_by: 'aperez', time: '14:05' },
    ],
  },
  ap: {
    records: [
      { invoice_number: 'INV-001', vendor_id: 'V-ABC', vendor_name: 'Consultores ABC', amount: 120000, invoice_date: '2026-01-10', bank_account: '123-456' },
      { invoice_number: 'INV-002', vendor_id: 'V-ABC', vendor_name: 'Consultores ABC', amount: 120000, invoice_date: '2026-01-11', bank_account: '123-456' },
      { invoice_number: 'INV-003', vendor_id: 'V-XYZ', vendor_name: 'Servicios XYZ',   amount: 45000,  invoice_date: '2026-01-12', bank_account: '789-012' },
      { invoice_number: 'INV-004', vendor_id: 'V-TEC', vendor_name: 'Tech Solutions',  amount: 980000, invoice_date: '2026-01-13', bank_account: '345-678' },
      { invoice_number: 'INV-005', vendor_id: 'V-TEC', vendor_name: 'Tech Solutions',  amount: 980000, invoice_date: '2026-01-14', bank_account: '345-678' },
    ],
  },
  payroll: {
    // >10 registros — habilita la prueba de outliers por Z-score (PAY_OUTLIERS).
    // E999 con nombre vacío dispara GHOST_EMPLOYEES; Carlos Pérez ($15M vs. ~$2M
    // del resto) dispara PAY_OUTLIERS.
    records: [
      { employee_id: 'E001', employee_name: 'Juan González',   gross_pay: 2500000,  days_worked: 30, department: 'IT' },
      { employee_id: 'E002', employee_name: 'María López',     gross_pay: 1800000,  days_worked: 30, department: 'Admin' },
      { employee_id: 'E003', employee_name: 'Carlos Pérez',    gross_pay: 15000000, days_worked: 30, department: 'IT' },
      { employee_id: 'E004', employee_name: 'Ana Rodríguez',   gross_pay: 2100000,  days_worked: 25, department: 'Ventas' },
      { employee_id: 'E005', employee_name: 'Pedro Martínez',  gross_pay: 1950000,  days_worked: 30, department: 'Ventas' },
      { employee_id: 'E006', employee_name: 'Lucía Fernández', gross_pay: 2200000,  days_worked: 30, department: 'IT' },
      { employee_id: 'E007', employee_name: 'Diego Ramírez',   gross_pay: 1750000,  days_worked: 30, department: 'Admin' },
      { employee_id: 'E008', employee_name: 'Sofía Torres',    gross_pay: 2050000,  days_worked: 30, department: 'Ventas' },
      { employee_id: 'E009', employee_name: 'Miguel Castro',   gross_pay: 1900000,  days_worked: 28, department: 'IT' },
      { employee_id: 'E010', employee_name: 'Valeria Ortiz',   gross_pay: 2300000,  days_worked: 30, department: 'Admin' },
      { employee_id: 'E011', employee_name: 'Roberto Silva',   gross_pay: 2000000,  days_worked: 30, department: 'Ventas' },
      { employee_id: 'E012', employee_name: 'Camila Vargas',   gross_pay: 1850000,  days_worked: 30, department: 'IT' },
      { employee_id: 'E013', employee_name: 'Andrés Molina',   gross_pay: 2150000,  days_worked: 30, department: 'Admin' },
      { employee_id: 'E999', employee_name: '',                gross_pay: 3200000,  days_worked: 30, department: 'NONE' },
      { employee_id: 'E014', employee_name: 'Gabriela Ríos',   gross_pay: 1980000,  days_worked: 30, department: 'Ventas' },
    ],
  },
  benford: {
    // 60 montos — el backend exige mínimo 50. 45 "naturales" con distribución
    // aproximada a Benford + 15 concentrados en dígito inicial 9, justo debajo
    // de un umbral de $100,000 (indicio clásico de fraccionamiento para evitar
    // aprobación) — sesga la distribución lo suficiente para disparar
    // SUSPECT/NON_CONFORMING y demostrar el caso de uso real.
    amounts: [
      1200, 1450, 1890, 1050, 1670, 1320, 1780, 1990, 1120, 1560, 1234, 1099, 1670, 1450, 1990,
      2340, 2870, 2100, 2560, 2990, 2450, 2780, 2340, 2120,
      3120, 3450, 3890, 3670, 3230,
      4560, 4120, 4890, 4340,
      5670, 5120, 5890,
      6340, 6780, 6120,
      7450, 7890,
      8120, 8670,
      9340, 9780,
      91200, 92500, 93800, 94100, 95600, 96900, 97200, 98500, 99100, 91800, 93400, 95000, 96200, 97800, 99900,
    ],
  },
  anomaly: {
    // 13 registros — el backend exige mínimo 10. Se conservan los 2 outliers
    // extremos originales (madrugada, sin actividad previa del usuario) sobre
    // una base más amplia de transacciones "normales" para que Isolation
    // Forest tenga contra qué comparar.
    records: [
      { amount: 45000, hour: 9,  day_of_week: 1, user_transactions: 12 },
      { amount: 52000, hour: 10, day_of_week: 2, user_transactions: 15 },
      { amount: 48000, hour: 11, day_of_week: 1, user_transactions: 10 },
      { amount: 51000, hour: 14, day_of_week: 3, user_transactions: 18 },
      { amount: 44000, hour: 9,  day_of_week: 4, user_transactions: 11 },
      { amount: 49500, hour: 13, day_of_week: 2, user_transactions: 14 },
      { amount: 47000, hour: 10, day_of_week: 5, user_transactions: 13 },
      { amount: 53000, hour: 15, day_of_week: 1, user_transactions: 16 },
      { amount: 46000, hour: 11, day_of_week: 3, user_transactions: 9 },
      { amount: 50000, hour: 12, day_of_week: 4, user_transactions: 17 },
      { amount: 960000, hour: 23, day_of_week: 6, user_transactions: 1 },
      { amount: 1200000, hour: 2, day_of_week: 0, user_transactions: 0 },
      { amount: 48500, hour: 9,  day_of_week: 2, user_transactions: 12 },
    ],
    numeric_fields: ['amount', 'hour', 'day_of_week', 'user_transactions'],
  },
};

// ─── Subir archivo — mapeo de columnas (sin plantilla fija) ───────────────────
// El usuario sube CUALQUIER CSV/Excel con SUS propios nombres de columna; acá
// solo se define qué campos entiende cada analizador (los mismos que ya
// aceptan amount_field/vendor_field/etc. en el backend) para que el frontend
// arme el `field_mapping` correcto — nunca se exige renombrar el archivo.

interface FieldDef { key: string; label: string; required?: boolean }

// IMPORTANTE: `key` debe ser EXACTO al nombre que cada endpoint de
// apps/ai-service/app/routers/analytics.py lee de `field_mapping` (ej. GL usa
// `fm.get("user", "posted_by")` — la clave del mapeo es "user", "posted_by" es
// solo el default cuando no se manda mapeo). No son necesariamente el mismo
// texto que el nombre de campo final — verificado en vivo contra cada endpoint.
const FIELD_DEFS: Partial<Record<AnalysisId, FieldDef[]>> = {
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
};

// Claves iguales a las de FIELD_DEFS (el nombre que field_mapping espera),
// NO necesariamente el nombre "final" del campo — ver nota arriba.
const FIELD_ALIASES: Record<string, string[]> = {
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
};

function normColName(c: string): string {
  return c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_-]/g, '');
}

function autoMatchColumn(fieldKey: string, columns: string[]): string {
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

function autoDetectNumericColumns(columns: string[], rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];
  const sample = rows.slice(0, Math.min(10, rows.length));
  return columns.filter(c => {
    const values = sample.map(r => r[c]).filter(v => v !== null && v !== undefined && v !== '');
    if (values.length === 0) return false;
    return values.every(v => !Number.isNaN(Number(v)));
  });
}

interface ParsedFile {
  columns:   string[];
  rows:      Record<string, unknown>[];
  rowCount:  number;
  totalRows: number;
  truncated: boolean;
  filename:  string;
}

// ─── Result renderer ──────────────────────────────────────────────────────────

function ResultSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-4 py-3">{children}</div>}
    </div>
  );
}

function renderValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Sí' : 'No';
  if (typeof val === 'number')  return val.toLocaleString('es-CL');
  if (Array.isArray(val))       return val.join(', ');
  if (typeof val === 'object')  return JSON.stringify(val);
  return String(val);
}

function ResultCard({ data }: { data: Record<string, unknown> }) {
  // Known high-level keys to render prominently
  const knownSections = [
    'summary', 'findings', 'anomalies', 'duplicates', 'risks',
    'high_risk_entries', 'suspicious_vendors', 'ghost_employees',
    'benford_analysis', 'metrics', 'recommendations',
  ];

  return (
    <div className="space-y-3">
      {Object.entries(data).map(([key, value]) => {
        if (value === undefined) return null;

        // Array of objects → table
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
          const rows = value as Record<string, unknown>[];
          const cols = Object.keys(rows[0]);
          return (
            <ResultSection key={key} title={key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} defaultOpen={knownSections.includes(key)}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {cols.map(c => (
                        <th key={c} className="text-left px-2 py-1.5 bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">
                          {c.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.slice(0, 20).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {cols.map(c => (
                          <td key={c} className="px-2 py-1.5 text-gray-700 whitespace-nowrap">
                            {renderValue(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 20 && (
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    Mostrando 20 de {rows.length} registros
                  </p>
                )}
              </div>
            </ResultSection>
          );
        }

        // Primitive array
        if (Array.isArray(value)) {
          return (
            <ResultSection key={key} title={key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} defaultOpen={false}>
              <div className="flex flex-wrap gap-1.5">
                {value.map((v, i) => (
                  <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                    {renderValue(v)}
                  </span>
                ))}
              </div>
            </ResultSection>
          );
        }

        // Object with sub-keys
        if (typeof value === 'object' && value !== null) {
          const obj = value as Record<string, unknown>;
          return (
            <ResultSection key={key} title={key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} defaultOpen={knownSections.includes(key)}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(obj).map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-gray-400 mb-0.5">{k.replace(/_/g, ' ')}</p>
                    <p className="text-sm font-semibold text-gray-800">{renderValue(v)}</p>
                  </div>
                ))}
              </div>
            </ResultSection>
          );
        }

        // Primitive
        return (
          <div key={key} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg">
            <span className="text-xs text-gray-500 w-32 shrink-0">
              {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </span>
            <span className="text-sm font-medium text-gray-800">{renderValue(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [selected, setSelected] = useState<AnalysisType>(ANALYSIS_TYPES[0]);
  const [running, setRunning]   = useState(false);
  const [result, setResult]     = useState<Record<string, unknown> | null>(null);
  const [error, setError]       = useState('');
  const [showPayload, setShowPayload] = useState(false);

  const [dataMode, setDataMode] = useState<'sample' | 'upload'>('sample');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [benfordColumn, setBenfordColumn] = useState('');
  const [anomalyColumns, setAnomalyColumns] = useState<string[]>([]);

  // Al cambiar de tipo de análisis con un archivo ya cargado, re-mapear
  // automáticamente contra las columnas de ESE archivo para el nuevo tipo.
  useEffect(() => {
    if (dataMode !== 'upload' || !parsed) return;
    if (selected.id === 'benford') {
      setBenfordColumn(autoMatchColumn('amount', parsed.columns));
    } else if (selected.id === 'anomaly') {
      setAnomalyColumns(autoDetectNumericColumns(parsed.columns, parsed.rows));
    } else {
      const defs = FIELD_DEFS[selected.id] ?? [];
      const mapping: Record<string, string> = {};
      defs.forEach(d => { mapping[d.key] = autoMatchColumn(d.key, parsed.columns); });
      setFieldMapping(mapping);
    }
    setResult(null);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.id, dataMode, parsed]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-subir el mismo archivo si se corrige algo
    if (!file) return;

    setUploading(true);
    setUploadError('');
    setResult(null);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await apiClient.postForm<ParsedFile>('/ai/parse-file', fd);
      setParsed(data);
    } catch (err) {
      setParsed(null);
      setUploadError(err instanceof Error ? err.message : 'No se pudo leer el archivo');
    } finally {
      setUploading(false);
    }
  }

  function clearUpload() {
    setParsed(null);
    setUploadError('');
    setFieldMapping({});
    setBenfordColumn('');
    setAnomalyColumns([]);
    setResult(null);
    setError('');
  }

  const fieldDefs = FIELD_DEFS[selected.id];
  const missingRequired = useMemo(() => {
    if (dataMode !== 'upload' || !fieldDefs) return false;
    return fieldDefs.some(d => d.required && !fieldMapping[d.key]);
  }, [dataMode, fieldDefs, fieldMapping]);

  const canRun = dataMode === 'sample'
    ? true
    : selected.id === 'benford'
      ? !!parsed && !!benfordColumn
      : selected.id === 'anomaly'
        ? !!parsed && anomalyColumns.length > 0
        : !!parsed && !missingRequired;

  async function runAnalysis() {
    setRunning(true);
    setResult(null);
    setError('');

    try {
      let payload: unknown;
      if (dataMode === 'sample') {
        payload = SAMPLE_DATA[selected.sampleKey];
      } else if (!parsed) {
        throw new Error('Primero sube un archivo');
      } else if (selected.id === 'benford') {
        const amounts = parsed.rows
          .map(r => Number(String(r[benfordColumn] ?? '').replace(/[^0-9.-]/g, '')))
          .filter(n => Number.isFinite(n) && n !== 0);
        payload = { amounts };
      } else if (selected.id === 'anomaly') {
        payload = { records: parsed.rows, numeric_fields: anomalyColumns };
      } else {
        const mapping: Record<string, string> = {};
        Object.entries(fieldMapping).forEach(([key, col]) => { if (col) mapping[key] = col; });
        payload = { records: parsed.rows, field_mapping: mapping };
      }

      const data = await apiClient.post<Record<string, unknown>>(
        `/ai/analytics/${selected.id}`,
        payload,
      );
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setRunning(false);
    }
  }

  const payload = SAMPLE_DATA[selected.sampleKey];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Analytics — CAATs"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Reportería e IA' },
          { label: 'Analytics CAATs' },
        ]}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex gap-3">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              <strong>Computer-Assisted Audit Techniques (CAATs)</strong> — Motor de análisis con IA integrado.
              Prueba con datos de muestra, o sube tu propio CSV/Excel — no necesita un formato predefinido,
              tú decides qué columna de tu archivo corresponde a cada campo antes de ejecutar.
            </p>
          </div>

          {/* Analysis type selector */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {ANALYSIS_TYPES.map(type => (
              <button
                key={type.id}
                onClick={() => { setSelected(type); setResult(null); setError(''); }}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition-all',
                  selected.id === type.id
                    ? 'border-[#0F2D4A] bg-[#0F2D4A]/5 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm',
                )}
              >
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', type.color)}>
                  <type.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className={cn(
                    'text-xs font-semibold leading-tight',
                    selected.id === type.id ? 'text-[#0F2D4A]' : 'text-gray-700',
                  )}>
                    {type.label}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Selected description + data mode + run */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-4">
                <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', selected.color)}>
                  <selected.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">{selected.label}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{selected.description}</p>
                </div>
              </div>

              <button
                onClick={runAnalysis}
                disabled={running || !canRun}
                title={!canRun ? 'Completa el mapeo de columnas requerido antes de ejecutar' : undefined}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0F2D4A] text-white text-sm font-medium rounded-xl hover:bg-[#1a4a7a] disabled:opacity-60 shrink-0 transition-colors"
              >
                {running
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando…</>
                  : <><Play className="w-4 h-4" /> Ejecutar análisis</>
                }
              </button>
            </div>

            {/* Data mode toggle */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
                {([
                  { key: 'sample' as const, label: 'Datos de muestra', icon: Search },
                  { key: 'upload' as const, label: 'Subir archivo',    icon: Upload },
                ]).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => { setDataMode(key); setResult(null); setError(''); }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                      dataMode === key ? 'bg-white text-[#0F2D4A] shadow-sm' : 'text-gray-500 hover:text-gray-700',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {dataMode === 'sample' ? (
                <div className="mt-3">
                  <button
                    onClick={() => setShowPayload(!showPayload)}
                    className="text-xs text-[#0F2D4A] font-medium flex items-center gap-1 hover:underline"
                  >
                    <Search className="w-3 h-3" />
                    {showPayload ? 'Ocultar' : 'Ver'} datos de muestra
                    {showPayload ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showPayload && (
                    <pre className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 overflow-x-auto max-h-56">
                      {JSON.stringify(payload, null, 2)}
                    </pre>
                  )}
                </div>
              ) : (
                <div className="mt-3 space-y-4">
                  {!parsed ? (
                    <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-8 cursor-pointer hover:border-[#0F2D4A]/40 hover:bg-gray-50 transition-colors">
                      <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} disabled={uploading} />
                      {uploading ? (
                        <>
                          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                          <span className="text-xs text-gray-500">Leyendo archivo…</span>
                        </>
                      ) : (
                        <>
                          <FileUp className="w-6 h-6 text-gray-300" />
                          <span className="text-sm font-medium text-gray-600">Haz clic para elegir un archivo</span>
                          <span className="text-[11px] text-gray-400">CSV o Excel (.xlsx, .xls) — cualquier nombre de columna</span>
                        </>
                      )}
                    </label>
                  ) : (
                    <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2 text-xs text-emerald-700">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>
                          <strong>{parsed.filename}</strong> — {parsed.rowCount} filas, {parsed.columns.length} columnas detectadas
                          {parsed.truncated && ` (de ${parsed.totalRows} totales — se usarán solo las primeras ${parsed.rowCount})`}
                        </span>
                      </div>
                      <button onClick={clearUpload} className="text-emerald-600 hover:text-emerald-800 shrink-0" title="Quitar archivo">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {uploadError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      {uploadError}
                    </div>
                  )}

                  {/* Column mapping */}
                  {parsed && (
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
                        <ListChecks className="w-3.5 h-3.5" />
                        Indica qué columna de tu archivo corresponde a cada campo
                      </p>

                      {selected.id === 'benford' ? (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-600 w-40 shrink-0">Columna de montos <span className="text-red-500">*</span></label>
                          <select
                            value={benfordColumn}
                            onChange={e => setBenfordColumn(e.target.value)}
                            className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">— selecciona —</option>
                            {parsed.columns.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      ) : selected.id === 'anomaly' ? (
                        <div>
                          <p className="text-[11px] text-gray-400 mb-2">
                            Selecciona las columnas numéricas que el modelo debe evaluar (mínimo 1).
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {parsed.columns.map(c => {
                              const active = anomalyColumns.includes(c);
                              return (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => setAnomalyColumns(prev =>
                                    active ? prev.filter(x => x !== c) : [...prev, c],
                                  )}
                                  className={cn(
                                    'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                                    active
                                      ? 'bg-[#0F2D4A] text-white border-[#0F2D4A]'
                                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
                                  )}
                                >
                                  {c}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
                          {(fieldDefs ?? []).map(field => (
                            <div key={field.key} className="flex items-center gap-2">
                              <label className="text-xs text-gray-600 w-40 shrink-0 truncate" title={field.label}>
                                {field.label} {field.required && <span className="text-red-500">*</span>}
                              </label>
                              <select
                                value={fieldMapping[field.key] ?? ''}
                                onChange={e => setFieldMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                                className={cn(
                                  'flex-1 rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500',
                                  field.required && !fieldMapping[field.key] ? 'border-red-200' : 'border-gray-200',
                                )}
                              >
                                <option value="">— no usar —</option>
                                {parsed.columns.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Error al ejecutar análisis</p>
                <p className="text-xs text-red-500 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Results */}
          {result && !running && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-gray-200">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <h3 className="text-base font-bold text-gray-900">
                  Resultados — {selected.label}
                </h3>
              </div>
              <ResultCard data={result} />
            </div>
          )}

          {/* Empty state before running */}
          {!result && !running && !error && (
            <div className="bg-white border border-gray-200 rounded-xl py-16 flex flex-col items-center text-gray-400">
              <BarChart3 className="w-14 h-14 mb-4 opacity-20" />
              <p className="text-sm font-medium">Selecciona un análisis y presiona &quot;Ejecutar&quot;</p>
              <p className="text-xs mt-1 text-gray-300">Los resultados aparecerán aquí</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
