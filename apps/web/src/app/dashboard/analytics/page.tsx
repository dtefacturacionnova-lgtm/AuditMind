'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { apiClient } from '@/lib/api-client';
import {
  BarChart3, Play, Loader2, AlertCircle, CheckCircle2,
  TrendingUp, Search, Database, FileSpreadsheet, Cpu,
  ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Analysis types ───────────────────────────────────────────────────────────

interface AnalysisType {
  id:          'gl' | 'ap' | 'payroll' | 'benford' | 'anomaly';
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

const SAMPLE_DATA: Record<string, unknown> = {
  gl: {
    records: [
      { date: '2026-01-15', account: '5010', description: 'Gastos operacionales', amount: 45000, user: 'jsmith', time: '09:32' },
      { date: '2026-01-15', account: '5010', description: 'Gastos operacionales', amount: 45000, user: 'jsmith', time: '09:33' },
      { date: '2026-01-20', account: '1010', description: 'Ajuste fin de mes',    amount: 1000000, user: 'admin', time: '23:45' },
      { date: '2026-01-22', account: '2030', description: 'Provisión especial',   amount: 500000,  user: 'admin', time: '22:10' },
      { date: '2026-02-01', account: '5020', description: 'Servicios profesionales', amount: 75000, user: 'aperez', time: '14:05' },
    ],
  },
  ap: {
    records: [
      { invoice_id: 'INV-001', vendor: 'Consultores ABC', amount: 120000, date: '2026-01-10', bank_account: '123-456' },
      { invoice_id: 'INV-002', vendor: 'Consultores ABC', amount: 120000, date: '2026-01-11', bank_account: '123-456' },
      { invoice_id: 'INV-003', vendor: 'Servicios XYZ',   amount: 45000,  date: '2026-01-12', bank_account: '789-012' },
      { invoice_id: 'INV-004', vendor: 'Tech Solutions',  amount: 980000, date: '2026-01-13', bank_account: '345-678' },
      { invoice_id: 'INV-005', vendor: 'Tech Solutions',  amount: 980000, date: '2026-01-14', bank_account: '345-678' },
    ],
  },
  payroll: {
    records: [
      { employee_id: 'E001', name: 'Juan González',  salary: 2500000, days_worked: 30, department: 'IT' },
      { employee_id: 'E002', name: 'María López',    salary: 1800000, days_worked: 30, department: 'Admin' },
      { employee_id: 'E003', name: 'Carlos Pérez',   salary: 15000000, days_worked: 30, department: 'IT' },
      { employee_id: 'E999', name: 'empleado_test',  salary: 3200000, days_worked: 30, department: 'NONE' },
      { employee_id: 'E004', name: 'Ana Rodríguez',  salary: 2100000, days_worked: 25, department: 'Ventas' },
    ],
  },
  benford: {
    amounts: [
      1234, 2456, 3100, 4200, 5678, 6100, 7890, 8234, 9100,
      1500, 2300, 3400, 4567, 5100, 6789, 7234, 8901, 9500,
      1100, 2100, 31000, 41000, 5500, 61000, 71000, 81000, 91000,
      12500, 23400, 34500, 45000, 50000, 60000, 70000, 80000, 90000,
    ],
  },
  anomaly: {
    records: [
      { amount: 45000, hour: 9,  day_of_week: 1, user_transactions: 12 },
      { amount: 52000, hour: 10, day_of_week: 2, user_transactions: 15 },
      { amount: 48000, hour: 11, day_of_week: 1, user_transactions: 10 },
      { amount: 960000, hour: 23, day_of_week: 6, user_transactions: 1 },
      { amount: 51000, hour: 14, day_of_week: 3, user_transactions: 18 },
      { amount: 1200000, hour: 2, day_of_week: 0, user_transactions: 0 },
      { amount: 44000, hour: 9,  day_of_week: 4, user_transactions: 11 },
    ],
    numeric_fields: ['amount', 'hour', 'day_of_week', 'user_transactions'],
  },
};

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

  async function runAnalysis() {
    setRunning(true);
    setResult(null);
    setError('');

    try {
      const payload = SAMPLE_DATA[selected.sampleKey];
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
              Selecciona el tipo de análisis, revisa la muestra de datos y ejecuta. En producción, los datos
              provendrán de los conectores SAP/REST configurados.
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

          {/* Selected description + run */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
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
                disabled={running}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0F2D4A] text-white text-sm font-medium rounded-xl hover:bg-[#1a4a7a] disabled:opacity-60 shrink-0 transition-colors"
              >
                {running
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando…</>
                  : <><Play className="w-4 h-4" /> Ejecutar análisis</>
                }
              </button>
            </div>

            {/* Sample data toggle */}
            <div className="mt-4 border-t border-gray-100 pt-4">
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
