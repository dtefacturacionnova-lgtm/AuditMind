/**
 * Renderizado PDF de resultados CAATs (Analytics) — espejo server-side de
 * apps/web/src/app/dashboard/analytics/page.tsx. Puppeteer nunca ejecuta
 * React, así que el resultado JSON ya calculado se renderiza aquí directo a
 * HTML/CSS, reutilizando las mismas traducciones que la pantalla.
 */

function esc(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const FIELD_LABELS: Record<string, string> = {
  total_entries: 'Total de Asientos', total_amount: 'Monto Total',
  period_start: 'Inicio del Período', period_end: 'Fin del Período',
  risk_score: 'Puntaje de Riesgo', total_invoices: 'Total de Facturas',
  vendor_count: 'Cantidad de Proveedores', total_employees: 'Total de Empleados',
  total_payroll: 'Total de Nómina', period: 'Período',
  total_records: 'Total de Registros', valid_records: 'Registros Válidos',
  chi2_statistic: 'Estadístico Chi-Cuadrado', chi2_pvalue: 'Valor p (Chi-Cuadrado)',
  mad: 'Desviación Absoluta Media (MAD)', anomaly_count: 'Cantidad de Anomalías',
  anomaly_rate_pct: 'Tasa de Anomalías (%)', vendor_id: 'Proveedor',
  total_amount_pct: '% del Total', pct_of_total: '% del Total',
  mean: 'Media', median: 'Mediana', std: 'Desv. Estándar', min: 'Mínimo', max: 'Máximo',
  p25: 'Percentil 25', p75: 'Percentil 75', p95: 'Percentil 95', count: 'Cantidad', sum: 'Suma',
  digit: 'Dígito', observed_pct: 'Observado (%)', expected_pct: 'Esperado (%)', deviation_pct: 'Desviación (%)',
  account_code: 'Cuenta', posted_by: 'Registrado por', days_worked: 'Días Trabajados',
  hour: 'Hora', day_of_week: 'Día de la Semana', user_transactions: 'Transacciones del Usuario',
  employee_id: 'ID Empleado', employee_name: 'Nombre', gross_pay: 'Salario Bruto', net_pay: 'Salario Neto',
  department: 'Departamento', invoice_number: 'N° Factura', invoice_date: 'Fecha de Factura',
  date: 'Fecha', account: 'Cuenta', amount: 'Monto', description: 'Descripción', user: 'Usuario',
  bank_account: 'Cuenta Bancaria', indice: 'Índice', puntaje: 'Puntaje', senales: 'Señales',
};

const TEST_NAME_LABELS: Record<string, string> = {
  ROUND_AMOUNTS: 'Montos Redondos', END_OF_PERIOD: 'Asientos de Fin de Período',
  DUPLICATE_AMOUNT_USER: 'Monto Duplicado por Usuario', WEEKEND_ENTRIES: 'Asientos en Fin de Semana',
  HIGH_VOLUME_USER: 'Usuario de Alto Volumen', DUPLICATE_INVOICES: 'Facturas Duplicadas',
  INVOICE_SPLITTING: 'Fraccionamiento de Facturas', GHOST_VENDORS: 'Proveedores Fantasma',
  EARLY_PAYMENT: 'Pago Anticipado Inusual', LATE_PAYMENT: 'Pago Atrasado',
  VENDOR_CONCENTRATION: 'Concentración de Proveedores', GHOST_EMPLOYEES: 'Empleados Fantasma',
  PAY_OUTLIERS: 'Pagos Atípicos', NET_EXCEEDS_GROSS: 'Neto Excede al Bruto',
  SHARED_BANK_ACCOUNTS: 'Cuentas Bancarias Compartidas', APPROVER_CONCENTRATION: 'Concentración de Aprobadores',
};

const RISK_LABEL: Record<string, string> = { CRITICAL: 'Crítico', HIGH: 'Alto', MEDIUM: 'Medio', LOW: 'Bajo' };
const RISK_BADGE: Record<string, string> = { CRITICAL: 'badge-critical', HIGH: 'badge-high', MEDIUM: 'badge-medium', LOW: 'badge-low' };
const CONFORMITY_LABEL: Record<string, string> = {
  CLOSE: 'Muy Cercano a Benford', ACCEPTABLE: 'Aceptable', SUSPECT: 'Sospechoso', NON_CONFORMING: 'No Conforme',
};

function label(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function fmt(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'number') return val.toLocaleString('es', { maximumFractionDigits: 2 });
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return String(val);
}

function kpiGrid(entries: Array<[string, unknown]>): string {
  return `<div class="grid-2" style="grid-template-columns:repeat(3,1fr);">
    ${entries.map(([k, v]) => `
      <div class="meta-strip" style="margin:0;">
        <dt style="font-size:8pt;text-transform:uppercase;letter-spacing:0.5px;">${esc(label(k))}</dt>
        <dd style="font-size:14pt;font-weight:700;color:#0F2D4A;">${esc(fmt(v))}</dd>
      </div>`).join('')}
  </div>`;
}

interface FindingLike { test_name: string; risk_level: string; record_count: number; description: string; sample_records?: unknown[] }

function findingsSection(findings: FindingLike[]): string {
  if (!findings?.length) return '<p class="text-muted text-small">Sin hallazgos.</p>';
  return findings.map(f => {
    const rows = (f.sample_records ?? []).slice(0, 5);
    const cols = rows.length > 0 && typeof rows[0] === 'object' ? Object.keys(rows[0] as object) : [];
    return `
      <div class="no-break" style="border:1px solid #E2E8F0;border-radius:2mm;padding:4mm;margin:3mm 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:10.5pt;color:#1a202c;">${esc(TEST_NAME_LABELS[f.test_name] ?? f.test_name)}</strong>
          <span class="badge ${RISK_BADGE[f.risk_level] ?? 'badge-info'}">${esc(RISK_LABEL[f.risk_level] ?? f.risk_level)} · ${f.record_count} registro(s)</span>
        </div>
        <p class="text-small" style="margin-top:2mm;color:#4A5568;">${esc(f.description)}</p>
        ${cols.length > 0 ? `
          <table style="margin-top:2mm;font-size:8pt;">
            <thead><tr>${cols.map(c => `<th>${esc(label(c))}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${esc(fmt((r as Record<string, unknown>)[c]))}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>` : ''}
      </div>`;
  }).join('');
}

function tableFromArray(rows: Array<Record<string, unknown>>): string {
  if (!rows?.length) return '<p class="text-muted text-small">Sin datos.</p>';
  const cols = Object.keys(rows[0]);
  return `<table>
    <thead><tr>${cols.map(c => `<th>${esc(label(c))}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${esc(fmt(r[c]))}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

/** Construye el body HTML del reporte CAATs para el tipo de análisis dado. */
export function renderCaatsPdfBody(type: string, result: Record<string, unknown>, label_: string): string {
  const scalarSkip = new Set([
    'findings', 'summary', 'vendor_concentration', 'pay_distribution', 'digits',
    'top_anomalous_amounts', 'interpretation', 'top_anomalies', 'feature_stats', 'conformity',
  ]);
  const kpiEntries = Object.entries(result).filter(([k, v]) => !scalarSkip.has(k) && typeof v !== 'object');

  let body = `<h1>Resultados — ${esc(label_)}</h1>`;
  body += kpiGrid(kpiEntries);

  if (result.conformity) {
    body += `<div class="meta-strip"><dt>Conformidad</dt><dd style="font-size:12pt;font-weight:700;">${esc(CONFORMITY_LABEL[result.conformity as string] ?? String(result.conformity))}</dd></div>`;
  }
  if (result.interpretation) {
    body += `<blockquote>${esc(result.interpretation)}</blockquote>`;
  }

  if (Array.isArray(result.findings)) {
    body += `<h2>Hallazgos</h2>${findingsSection(result.findings as FindingLike[])}`;
  }
  if (Array.isArray(result.top_anomalies)) {
    body += `<h2>Principales Anomalías</h2>${tableFromArray((result.top_anomalies as Array<Record<string, unknown>>).map(a => ({
      indice: a.index, puntaje: a.anomaly_score, senales: Array.isArray(a.flags) ? (a.flags as string[]).join(', ') : a.flags,
    })))}`;
  }
  if (Array.isArray(result.vendor_concentration)) {
    body += `<h2>Concentración por Proveedor</h2>${tableFromArray(result.vendor_concentration as Array<Record<string, unknown>>)}`;
  }
  if (Array.isArray(result.top_anomalous_amounts)) {
    body += `<h2>Montos Más Atípicos (Benford)</h2>${tableFromArray(result.top_anomalous_amounts as Array<Record<string, unknown>>)}`;
  }
  if (Array.isArray(result.digits)) {
    body += `<h2>Distribución de Dígitos</h2>${tableFromArray(result.digits as Array<Record<string, unknown>>)}`;
  }
  if (result.pay_distribution && typeof result.pay_distribution === 'object') {
    const pd = result.pay_distribution as Record<string, unknown>;
    const { by_department, ...flat } = pd;
    body += `<h2>Distribución Salarial</h2>${kpiGrid(Object.entries(flat))}`;
    if (by_department && typeof by_department === 'object') {
      const rows = Object.entries(by_department as Record<string, unknown>).map(([dept, stats]) => ({
        departamento: dept, ...(stats as Record<string, unknown>),
      }));
      body += `<h3>Por Departamento</h3>${tableFromArray(rows)}`;
    }
  }
  if (result.feature_stats && typeof result.feature_stats === 'object') {
    const rows = Object.entries(result.feature_stats as Record<string, unknown>).map(([field, stats]) => ({
      variable: field, ...(typeof stats === 'object' ? stats as Record<string, unknown> : { valor: stats }),
    }));
    body += `<h2>Estadísticas de Variables</h2>${tableFromArray(rows)}`;
  }

  return body;
}
