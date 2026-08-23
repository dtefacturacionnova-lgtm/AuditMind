'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Header } from '@/components/layout/Header';
import { apiClient } from '@/lib/api-client';
import {
  BarChart3, Play, Loader2, AlertCircle, CheckCircle2,
  TrendingUp, Search, Database, FileSpreadsheet, Cpu,
  ChevronDown, ChevronUp, Info, Upload, FileUp, X, ListChecks,
  AlertTriangle, RotateCcw, HelpCircle, FileDown, Table2, ShieldCheck,
  Target, FlaskConical, ScrollText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fieldLabel, testLabel, formatValue,
  RISK_LEVEL_LABELS, RISK_LEVEL_COLORS, CONFORMITY_LABELS, CONFORMITY_COLORS,
} from '@/lib/caats-labels';
import { METHODOLOGY } from '@/lib/caats-methodology';

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

function KpiStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-4 py-3">
      <p className="text-[11px] text-gray-500 font-medium leading-tight">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-1 leading-tight">{value}</p>
    </div>
  );
}

function SeverityBadge({ level }: { level: string }) {
  const c = RISK_LEVEL_COLORS[level] ?? RISK_LEVEL_COLORS.LOW;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0', c.bg, c.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dot)} />
      {RISK_LEVEL_LABELS[level] ?? level}
    </span>
  );
}

interface FindingLike {
  test_name: string; risk_level: string; record_count: number;
  description: string; sample_records?: Record<string, unknown>[];
}

function SeverityBarChart({ findings }: { findings: FindingLike[] }) {
  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const counts: Record<string, number> = {};
  findings.forEach(f => { counts[f.risk_level] = (counts[f.risk_level] ?? 0) + 1; });
  const max = Math.max(...order.map(k => counts[k] ?? 0), 1);
  const active = order.filter(k => counts[k] > 0);
  if (active.length === 0) return null;
  return (
    <div className="flex items-end gap-4 h-24 px-2">
      {active.map(k => {
        const c = RISK_LEVEL_COLORS[k];
        const h = Math.max(((counts[k] ?? 0) / max) * 100, 12);
        return (
          <div key={k} className="flex flex-col items-center justify-end h-full gap-1.5 flex-1 max-w-[64px]">
            <span className="text-xs font-bold text-gray-700">{counts[k]}</span>
            <div className="w-full rounded-t-md overflow-hidden bg-gray-100" style={{ height: '100%' }}>
              <div className={cn('w-full rounded-t-md', c.dot)} style={{ height: `${h}%`, marginTop: 'auto' }} />
            </div>
            <span className="text-[10px] text-gray-400">{RISK_LEVEL_LABELS[k]}</span>
          </div>
        );
      })}
    </div>
  );
}

function SampleRecordsTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows || rows.length === 0) return null;
  const cols = Object.keys(rows[0]);
  return (
    <div className="mt-2.5 overflow-x-auto border border-gray-100 rounded-lg">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-gray-50">
            {cols.map(c => (
              <th key={c} className="text-left px-2 py-1.5 text-gray-400 font-semibold whitespace-nowrap">{fieldLabel(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.slice(0, 5).map((row, i) => (
            <tr key={i}>
              {cols.map(c => (
                <td key={c} className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{formatValue(row[c], c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FindingCard({ finding }: { finding: FindingLike }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="font-semibold text-sm text-gray-900">{testLabel(finding.test_name)}</h4>
        <SeverityBadge level={finding.risk_level} />
      </div>
      <p className="text-xs text-gray-500 mt-1.5">{finding.description}</p>
      <SampleRecordsTable rows={finding.sample_records ?? []} />
    </div>
  );
}

function GenericTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows || rows.length === 0) return <p className="text-xs text-gray-400 py-3 text-center">Sin datos.</p>;
  const cols = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c} className="text-left px-2 py-1.5 bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">
                {fieldLabel(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.slice(0, 20).map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {cols.map(c => (
                <td key={c} className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{formatValue(row[c], c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 20 && <p className="text-xs text-gray-400 mt-2 text-center">Mostrando 20 de {rows.length} registros</p>}
    </div>
  );
}

// Claves que ya se muestran en secciones dedicadas — se excluyen de los KPI
// escalares genéricos para no duplicar la información.
const RESULT_SPECIAL_KEYS = new Set([
  'findings', 'summary', 'vendor_concentration', 'pay_distribution', 'digits',
  'top_anomalous_amounts', 'interpretation', 'top_anomalies', 'feature_stats', 'conformity',
]);

function AnalysisResultView({ result }: { result: Record<string, unknown> }) {
  const kpiEntries = Object.entries(result).filter(([k, v]) => !RESULT_SPECIAL_KEYS.has(k) && typeof v !== 'object');
  const findings = Array.isArray(result.findings) ? (result.findings as FindingLike[]) : null;
  const topAnomalies = Array.isArray(result.top_anomalies) ? (result.top_anomalies as Array<Record<string, unknown>>) : null;
  const vendorConcentration = Array.isArray(result.vendor_concentration) ? (result.vendor_concentration as Record<string, unknown>[]) : null;
  const topAnomalousAmounts = Array.isArray(result.top_anomalous_amounts) ? (result.top_anomalous_amounts as Record<string, unknown>[]) : null;
  const digits = Array.isArray(result.digits) ? (result.digits as Record<string, unknown>[]) : null;
  const payDist = result.pay_distribution && typeof result.pay_distribution === 'object'
    ? result.pay_distribution as Record<string, unknown> : null;
  const featureStats = result.feature_stats && typeof result.feature_stats === 'object'
    ? result.feature_stats as Record<string, unknown> : null;
  const conformity = typeof result.conformity === 'string' ? result.conformity : null;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpiEntries.map(([k, v]) => (
          <KpiStat key={k} label={fieldLabel(k)} value={formatValue(v, k)} />
        ))}
      </div>

      {conformity && (
        <div className={cn('rounded-xl px-4 py-3 flex items-center gap-3', CONFORMITY_COLORS[conformity]?.bg ?? 'bg-gray-50')}>
          <ShieldCheck className={cn('w-5 h-5 shrink-0', CONFORMITY_COLORS[conformity]?.text ?? 'text-gray-600')} />
          <div>
            <p className="text-[11px] font-medium text-gray-500">Conformidad con Ley de Benford</p>
            <p className={cn('text-sm font-bold', CONFORMITY_COLORS[conformity]?.text ?? 'text-gray-800')}>
              {CONFORMITY_LABELS[conformity] ?? conformity}
            </p>
          </div>
        </div>
      )}

      {typeof result.interpretation === 'string' && (
        <div className="bg-blue-50 border-l-4 border-blue-400 rounded-r-lg px-4 py-3">
          <p className="text-sm text-blue-800 italic">{result.interpretation}</p>
        </div>
      )}

      {findings && findings.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-800 mb-3">Hallazgos ({findings.length})</h3>
          <SeverityBarChart findings={findings} />
          <div className="space-y-2.5 mt-3">
            {findings.map((f, i) => <FindingCard key={i} finding={f} />)}
          </div>
        </div>
      )}
      {findings && findings.length === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> No se detectaron hallazgos de riesgo en los datos analizados.
        </div>
      )}

      {topAnomalies && topAnomalies.length > 0 && (
        <ResultSection title={`Principales Anomalías (${topAnomalies.length})`}>
          <div className="space-y-2.5">
            {topAnomalies.map((a, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700">Registro #{String(a.index)}</span>
                  <span className="text-[11px] text-gray-400">Puntaje: {formatValue(a.anomaly_score)}</span>
                </div>
                {Array.isArray(a.flags) && a.flags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(a.flags as string[]).map((flag, j) => (
                      <span key={j} className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">{flag}</span>
                    ))}
                  </div>
                )}
                {a.record && typeof a.record === 'object'
                  ? <SampleRecordsTable rows={[a.record as Record<string, unknown>]} />
                  : null}
              </div>
            ))}
          </div>
        </ResultSection>
      )}

      {vendorConcentration && (
        <ResultSection title="Concentración por Proveedor">
          <GenericTable rows={vendorConcentration} />
        </ResultSection>
      )}

      {topAnomalousAmounts && (
        <ResultSection title="Montos Más Atípicos">
          <GenericTable rows={topAnomalousAmounts} />
        </ResultSection>
      )}

      {digits && (
        <ResultSection title="Distribución de Dígitos (Observado vs. Esperado)">
          <div className="flex items-end gap-2 h-32 px-2">
            {digits.map((d) => {
              const obs = Number(d.observed_pct ?? 0);
              const exp = Number(d.expected_pct ?? 0);
              const max = Math.max(...digits.map(x => Math.max(Number(x.observed_pct ?? 0), Number(x.expected_pct ?? 0))), 1);
              return (
                <div key={String(d.digit)} className="flex flex-col items-center justify-end h-full flex-1 gap-1">
                  <div className="w-full flex items-end justify-center gap-0.5" style={{ height: '100%' }}>
                    <div className={cn('w-1/2 rounded-t', d.is_anomalous ? 'bg-red-400' : 'bg-blue-500')}
                      style={{ height: `${Math.max((obs / max) * 100, 3)}%`, marginTop: 'auto' }} title={`Observado ${obs}%`} />
                    <div className="w-1/2 rounded-t bg-gray-300" style={{ height: `${Math.max((exp / max) * 100, 3)}%`, marginTop: 'auto' }} title={`Esperado ${exp}%`} />
                  </div>
                  <span className="text-[10px] text-gray-400">{String(d.digit)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 justify-center text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />Observado</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-300" />Esperado (Benford)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" />Observado — anómalo</span>
          </div>
        </ResultSection>
      )}

      {payDist && (
        <ResultSection title="Distribución Salarial">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {Object.entries(payDist).filter(([k]) => k !== 'by_department').map(([k, v]) => (
              <KpiStat key={k} label={fieldLabel(k)} value={formatValue(v, k)} />
            ))}
          </div>
          {payDist.by_department && typeof payDist.by_department === 'object'
            ? (
              <GenericTable rows={Object.entries(payDist.by_department as Record<string, unknown>).map(([dept, stats]) => ({
                departamento: dept, ...(stats as Record<string, unknown>),
              }))} />
            )
            : null}
        </ResultSection>
      )}

      {featureStats && (
        <ResultSection title="Estadísticas de Variables">
          <GenericTable rows={Object.entries(featureStats).map(([field, stats]) => ({
            variable: field,
            ...(typeof stats === 'object' && stats !== null ? stats as Record<string, unknown> : { valor: stats }),
          }))} />
        </ResultSection>
      )}
    </div>
  );
}

// ─── Modal de metodología ──────────────────────────────────────────────────────

function MethodologyModal({ analysisId, label, onClose }: { analysisId: AnalysisId; label: string; onClose: () => void }) {
  const info = METHODOLOGY[analysisId];
  if (!info) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-[#0F2D4A] to-[#1a4a7a] px-6 py-5 flex items-start justify-between gap-4 shrink-0">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">Metodología del análisis</p>
            <h3 className="text-xl font-bold text-white mt-0.5">{label}</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
              <Target className="w-3.5 h-3.5" /> Objetivo
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{info.objetivo}</p>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
              <FlaskConical className="w-3.5 h-3.5" /> Metodología
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{info.metodologia}</p>
          </div>

          {info.normativa && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                <ScrollText className="w-3.5 h-3.5" /> Marco normativo de referencia
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">{info.normativa}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Pruebas que aplica</p>
            <div className="space-y-2">
              {info.pruebas.map((p, i) => (
                <div key={i} className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <p className="text-xs font-semibold text-gray-800">{p.nombre}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{p.descripcion}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-3">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Limitaciones y buen uso</p>
            <p className="text-xs text-amber-700 leading-relaxed">{info.limitaciones}</p>
          </div>
        </div>
      </div>
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
  const [showMethodology, setShowMethodology] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

  const [dataMode, setDataMode] = useState<'sample' | 'upload'>('sample');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showRowPicker, setShowRowPicker] = useState(false);
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

  async function parseFile(file: File, headerRow?: number) {
    setUploading(true);
    setUploadError('');
    setResult(null);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (headerRow !== undefined) fd.append('headerRow', String(headerRow));
      const data = await apiClient.postForm<ParsedFile>('/ai/parse-file', fd);
      setParsed(data);
      setShowRowPicker(false);
    } catch (err) {
      setParsed(null);
      setUploadError(err instanceof Error ? err.message : 'No se pudo leer el archivo');
    } finally {
      setUploading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-subir el mismo archivo si se corrige algo
    if (!file) return;
    setUploadedFile(file);
    await parseFile(file);
  }

  function clearUpload() {
    setParsed(null);
    setUploadedFile(null);
    setShowRowPicker(false);
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

  async function exportPdf() {
    if (!result) return;
    setExporting('pdf');
    try {
      const filename = `auditmind_caats_${selected.id}_${new Date().toISOString().slice(0, 10)}.pdf`;
      await apiClient.postDownload(`/ai/analytics/${selected.id}/pdf`, { result, label: selected.label }, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el PDF');
    } finally {
      setExporting(null);
    }
  }

  function exportExcel() {
    if (!result) return;
    setExporting('excel');
    try {
      const wb = XLSX.utils.book_new();

      const scalarSkip = new Set([
        'findings', 'summary', 'vendor_concentration', 'pay_distribution', 'digits',
        'top_anomalous_amounts', 'interpretation', 'top_anomalies', 'feature_stats', 'conformity',
      ]);
      const summaryRows = Object.entries(result)
        .filter(([k, v]) => !scalarSkip.has(k) && typeof v !== 'object')
        .map(([k, v]) => ({ Indicador: fieldLabel(k), Valor: formatValue(v, k) }));
      if (typeof result.conformity === 'string') summaryRows.push({ Indicador: fieldLabel('conformity'), Valor: CONFORMITY_LABELS[result.conformity] ?? result.conformity });
      if (typeof result.interpretation === 'string') summaryRows.push({ Indicador: 'Interpretación', Valor: result.interpretation });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Resumen');

      if (Array.isArray(result.findings) && result.findings.length > 0) {
        const findingRows = (result.findings as FindingLike[]).map(f => ({
          Prueba: testLabel(f.test_name),
          'Nivel de Riesgo': RISK_LEVEL_LABELS[f.risk_level] ?? f.risk_level,
          Registros: f.record_count,
          Descripción: f.description,
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(findingRows), 'Hallazgos');

        (result.findings as FindingLike[]).forEach((f, i) => {
          if (f.sample_records && f.sample_records.length > 0) {
            const sheetName = `Muestra ${i + 1} - ${testLabel(f.test_name)}`.slice(0, 31);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(f.sample_records), sheetName);
          }
        });
      }
      if (Array.isArray(result.vendor_concentration)) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(result.vendor_concentration), 'Concentración Proveedores');
      }
      if (Array.isArray(result.top_anomalous_amounts)) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(result.top_anomalous_amounts), 'Montos Atípicos');
      }
      if (Array.isArray(result.digits)) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(result.digits), 'Distribución de Dígitos');
      }
      if (Array.isArray(result.top_anomalies)) {
        const rows = (result.top_anomalies as Array<Record<string, unknown>>).map(a => ({
          Índice: a.index, Puntaje: a.anomaly_score,
          Señales: Array.isArray(a.flags) ? (a.flags as string[]).join(', ') : a.flags,
          ...(a.record && typeof a.record === 'object' ? a.record as Record<string, unknown> : {}),
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Anomalías');
      }

      XLSX.writeFile(wb, `auditmind_caats_${selected.id}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(null);
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-gray-900">{selected.label}</h2>
                    <button
                      onClick={() => setShowMethodology(true)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-[#0F2D4A] bg-[#0F2D4A]/5 hover:bg-[#0F2D4A]/10 px-2 py-1 rounded-full transition-colors"
                    >
                      <HelpCircle className="w-3 h-3" /> Metodología
                    </button>
                  </div>
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

            {showMethodology && (
              <MethodologyModal analysisId={selected.id} label={selected.label} onClose={() => setShowMethodology(false)} />
            )}

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

                  {/* Validación del encabezado: avisa si el archivo trae título/filas
                      antes de las columnas, y deja elegir la fila correcta a mano. */}
                  {parsed && (parsed.headerRowIndex > 0 || parsed.headerConfidence === 'low') && (
                    <div className={cn(
                      'rounded-lg px-3 py-2 text-xs space-y-2',
                      parsed.headerConfidence === 'low'
                        ? 'bg-amber-50 border border-amber-200 text-amber-800'
                        : 'bg-blue-50 border border-blue-200 text-blue-800',
                    )}>
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          {parsed.headerRowIndex > 0
                            ? `El archivo trae ${parsed.headerRowIndex} fila(s) antes de los encabezados (título de reporte, filas vacías, etc.) — se usó la fila ${parsed.headerRowIndex + 1} como encabezado.`
                            : 'No estamos completamente seguros de que la fila 1 sea el encabezado correcto.'}
                          {parsed.headerConfidence === 'low' && ' Revisa que las columnas de abajo se vean correctas.'}
                        </span>
                      </div>
                      <button
                        onClick={() => setShowRowPicker(s => !s)}
                        className="flex items-center gap-1 font-semibold hover:underline"
                      >
                        <RotateCcw className="w-3 h-3" />
                        {showRowPicker ? 'Ocultar filas originales' : '¿No es correcto? Elegir la fila de encabezado'}
                      </button>
                      {showRowPicker && (
                        <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                          <table className="w-full text-[11px]">
                            <tbody className="divide-y divide-gray-100">
                              {parsed.rawPreview.map((row, i) => (
                                <tr key={i} className={i === parsed.headerRowIndex ? 'bg-emerald-50' : undefined}>
                                  <td className="px-2 py-1 text-gray-400 whitespace-nowrap">Fila {i + 1}</td>
                                  <td className="px-2 py-1 text-gray-700 font-mono whitespace-nowrap">
                                    {row.filter(Boolean).join(' | ') || <span className="text-gray-300">(vacía)</span>}
                                  </td>
                                  <td className="px-2 py-1 text-right">
                                    <button
                                      onClick={() => uploadedFile && parseFile(uploadedFile, i)}
                                      disabled={uploading}
                                      className="text-[#0F2D4A] font-semibold hover:underline disabled:opacity-40"
                                    >
                                      Usar esta fila
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
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
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-200 flex-wrap">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <h3 className="text-base font-bold text-gray-900">
                    Resultados — {selected.label}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportExcel}
                    disabled={exporting !== null}
                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {exporting === 'excel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Table2 className="w-3.5 h-3.5" />}
                    Excel
                  </button>
                  <button
                    onClick={exportPdf}
                    disabled={exporting !== null}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0F2D4A] hover:bg-[#1a4a7a] px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {exporting === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                    PDF
                  </button>
                </div>
              </div>
              <AnalysisResultView result={result} />
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
