/**
 * Plantillas HTML para PDF — funciones puras que toman datos y devuelven HTML body.
 * Se envuelven con PdfService.renderBrandedLayout(...).
 */
import { renderCosoResultsBlock, renderCosoQuestionTable } from './coso-pdf';
import { renderSampleItemRegisterTable, renderSamplingEvaluationBlock } from './nia530-pdf';
import { renderFieldEvidenceBlock, type FieldEvidencePdf } from './field-evidence-pdf';

// Utilities ────────────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtMoney(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (!Number.isFinite(num)) return '—';
  return num.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function severityBadge(sev: string): string {
  const map: Record<string, string> = {
    CRITICAL:      'badge-critical',
    HIGH:          'badge-high',
    MEDIUM:        'badge-medium',
    LOW:           'badge-low',
    INFORMATIONAL: 'badge-info',
  };
  return `<span class="badge ${map[sev] ?? 'badge-info'}">${esc(sev)}</span>`;
}

// ─── Audit report ────────────────────────────────────────────────────────────

export interface AuditReportData {
  audit: {
    title: string; code: string; type: string;
    startDate?: string; endDate?: string;
    scope?: string; objectives?: string;
    materiality?: number; materialityBase?: string;
    auditEntity?: { name: string } | null;
    team?: Array<{ user: { name: string; role: string } }>;
  };
  findings: Array<{
    id: string; title: string; severity: string;
    condition: string; criteria: string; cause: string;
    effect: string; risk: string; recommendation: string;
    managementResponse?: string | null;
    isMaterial?: boolean | null;
  }>;
  workingPapers?: Array<{
    code: string; title: string; type: string;
    indexSection: string; status: string;
  }>;
}

export function renderAuditReportBody(data: AuditReportData): string {
  const { audit, findings, workingPapers } = data;

  const findingsRows = findings.length === 0
    ? '<tr><td colspan="3" class="text-muted text-small">No se identificaron hallazgos significativos en el alcance auditado.</td></tr>'
    : findings.map((f, i) => `
      <tr class="no-break">
        <td style="width: 8mm; vertical-align: top; font-weight: 600;">${i + 1}</td>
        <td>${esc(f.title)}</td>
        <td style="width: 28mm; text-align: center; vertical-align: top;">${severityBadge(f.severity)}</td>
      </tr>
    `).join('');

  const findingDetailSections = findings.map((f, i) => `
    <div class="no-break" style="margin: 8mm 0 6mm 0; border: 1px solid #E2E8F0; border-radius: 3mm; padding: 5mm;">
      <h3 style="margin-top: 0; display: flex; align-items: center; gap: 3mm;">
        <span style="font-weight: 700;">${i + 1}.</span>
        <span>${esc(f.title)}</span>
        ${severityBadge(f.severity)}
        ${f.isMaterial ? '<span class="badge badge-high">MATERIAL</span>' : ''}
      </h3>
      <table>
        <tr><th style="width: 30mm;">Condición</th><td class="pre-wrap">${esc(f.condition)}</td></tr>
        <tr><th>Criterio</th><td class="pre-wrap">${esc(f.criteria)}</td></tr>
        <tr><th>Causa</th><td class="pre-wrap">${esc(f.cause)}</td></tr>
        <tr><th>Efecto</th><td class="pre-wrap">${esc(f.effect)}</td></tr>
        <tr><th>Riesgo</th><td class="pre-wrap">${esc(f.risk)}</td></tr>
        <tr><th>Recomendación</th><td class="pre-wrap">${esc(f.recommendation)}</td></tr>
        ${f.managementResponse ? `<tr><th>Respuesta de Gerencia</th><td class="pre-wrap">${esc(f.managementResponse)}</td></tr>` : ''}
      </table>
    </div>
  `).join('');

  const wpRows = workingPapers && workingPapers.length > 0
    ? workingPapers.map(wp => `
        <tr>
          <td style="width: 16mm; font-family: monospace;">${esc(wp.code)}</td>
          <td>${esc(wp.title)}</td>
          <td style="width: 22mm; text-align: center;">${esc(wp.indexSection)}</td>
          <td style="width: 26mm; text-align: center;">${esc(wp.status)}</td>
        </tr>
      `).join('')
    : '';

  return `
    <h1>Resumen Ejecutivo</h1>

    <div class="meta-strip">
      <div class="grid-2">
        <div class="kv">
          <div><span class="kv-label">Código:</span> ${esc(audit.code)}</div>
          <div><span class="kv-label">Tipo:</span> ${esc(audit.type)}</div>
          <div><span class="kv-label">Entidad:</span> ${esc(audit.auditEntity?.name ?? '—')}</div>
        </div>
        <div class="kv">
          <div><span class="kv-label">Inicio:</span> ${fmtDate(audit.startDate)}</div>
          <div><span class="kv-label">Fin:</span> ${fmtDate(audit.endDate)}</div>
          <div><span class="kv-label">Materialidad:</span> ${audit.materiality ? `USD ${fmtMoney(audit.materiality)}` : '—'}</div>
        </div>
      </div>
    </div>

    ${audit.objectives ? `<h2>Objetivos</h2><p class="pre-wrap">${esc(audit.objectives)}</p>` : ''}
    ${audit.scope      ? `<h2>Alcance</h2><p class="pre-wrap">${esc(audit.scope)}</p>` : ''}

    <h2>Equipo de Auditoría</h2>
    ${audit.team && audit.team.length > 0 ? `
      <table>
        <thead><tr><th>Nombre</th><th>Rol</th></tr></thead>
        <tbody>${audit.team.map(t => `<tr><td>${esc(t.user.name)}</td><td>${esc(t.user.role)}</td></tr>`).join('')}</tbody>
      </table>
    ` : '<p class="text-muted text-small">Sin equipo asignado.</p>'}

    <h2>Resumen de Hallazgos</h2>
    <table>
      <thead><tr><th>N°</th><th>Hallazgo</th><th>Severidad</th></tr></thead>
      <tbody>${findingsRows}</tbody>
    </table>

    ${findings.length > 0 ? `
      <div class="page-break"></div>
      <h1>Detalle de Hallazgos</h1>
      ${findingDetailSections}
    ` : ''}

    ${wpRows ? `
      <div class="page-break"></div>
      <h1>Índice de Papeles de Trabajo</h1>
      <table>
        <thead><tr><th>Código</th><th>Título</th><th>Sección</th><th>Estado</th></tr></thead>
        <tbody>${wpRows}</tbody>
      </table>
    ` : ''}

    <div class="signature-block">
      <div class="grid-2">
        <div>
          <span class="signature-line"></span><br/>
          <span class="text-small text-muted">Preparado por</span>
        </div>
        <div>
          <span class="signature-line"></span><br/>
          <span class="text-small text-muted">Aprobado por (Socio / CAE)</span>
        </div>
      </div>
    </div>
  `;
}

// ─── Finding report (1 hallazgo individual) ──────────────────────────────────

export interface FindingReportData {
  finding: {
    id: string; title: string; severity: string; status: string;
    condition: string; criteria: string; cause: string;
    effect: string; risk: string; recommendation: string;
    managementResponse?: string | null;
    isMaterial?: boolean | null;
    normativeReference?: string | null;
    normativeArticle?: string | null;
    effectAmount?: number | string | null;
    dueDate?: string | null;
    audit: { title: string; code: string };
  };
}

export function renderFindingBody(data: FindingReportData): string {
  const f = data.finding;
  return `
    <div class="meta-strip">
      <div class="grid-2">
        <div class="kv">
          <div><span class="kv-label">Auditoría:</span> ${esc(f.audit.title)}</div>
          <div><span class="kv-label">Código:</span> ${esc(f.audit.code)}</div>
        </div>
        <div class="kv">
          <div><span class="kv-label">Severidad:</span> ${severityBadge(f.severity)} ${f.isMaterial ? '<span class="badge badge-high">MATERIAL</span>' : ''}</div>
          <div><span class="kv-label">Estado:</span> ${esc(f.status)}</div>
          ${f.effectAmount ? `<div><span class="kv-label">Impacto:</span> USD ${fmtMoney(f.effectAmount)}</div>` : ''}
        </div>
      </div>
    </div>

    <h2>Condición</h2>
    <p class="pre-wrap">${esc(f.condition)}</p>

    <h2>Criterio</h2>
    <p class="pre-wrap">${esc(f.criteria)}</p>
    ${f.normativeReference ? `<p class="text-small text-muted">Referencia: ${esc(f.normativeReference)}${f.normativeArticle ? ' — ' + esc(f.normativeArticle) : ''}</p>` : ''}

    <h2>Causa</h2>
    <p class="pre-wrap">${esc(f.cause)}</p>

    <h2>Efecto</h2>
    <p class="pre-wrap">${esc(f.effect)}</p>

    <h2>Riesgo</h2>
    <blockquote class="pre-wrap">${esc(f.risk)}</blockquote>

    <h2>Recomendación</h2>
    <p class="pre-wrap">${esc(f.recommendation)}</p>

    ${f.dueDate ? `<p class="text-small"><strong>Fecha límite de remediación:</strong> ${fmtDate(f.dueDate)}</p>` : ''}

    ${f.managementResponse ? `
      <h2>Respuesta de la Gerencia</h2>
      <p class="pre-wrap">${esc(f.managementResponse)}</p>
    ` : '<h2>Respuesta de la Gerencia</h2><p class="text-muted text-small">Pendiente de respuesta.</p>'}

    <div class="signature-block">
      <div class="grid-2">
        <div>
          <span class="signature-line"></span><br/>
          <span class="text-small text-muted">Auditor responsable</span>
        </div>
        <div>
          <span class="signature-line"></span><br/>
          <span class="text-small text-muted">Aceptado por la Gerencia</span>
        </div>
      </div>
    </div>
  `;
}

// ─── Working paper (papel de trabajo inteligente) ─────────────────────────────

export interface WorkingPaperReportData {
  paper: {
    code: string;
    paperCode?: string | null;
    title: string;
    type: string;
    wpKind: string;
    status: string;
    indexSection: string;
    qualityScore?: number | null;
    version?: number;
    conclusion?: string | null;
    narrative?: string | null;
    preparedBy?: { name: string } | null;
    reviewedBy?: { name: string } | null;
    preparedAt?: string | null;
    reviewedAt?: string | null;
    audit: { title: string };
    sections?: Array<{ sectionKey: string; label: string; value: unknown; fieldType: string; tab?: string | null;
      attachments?: Array<{ filename: string; url: string; size?: number }>;
    }>;
    content?: { procedures?: Array<{
      title?: string; statement?: string; procedure?: string; development?: string; area?: string; niaRef?: string;
      attachments?: Array<{ filename: string; url: string; size?: number }>;
      crossRefs?: Array<{ code: string; title: string }>;
    }> };
    sourceLinks?: Array<{ targetCode?: string; targetTitle?: string; sourceField?: string; targetField?: string; mappingType?: string }>;
    targetLinks?: Array<{ sourceCode?: string; sourceTitle?: string; sourceField?: string; targetField?: string; mappingType?: string }>;
    comments?: Array<{ content: string; createdAt?: string | null; resolved?: boolean }>;
    versions?: Array<{ version: number; changedAt?: string; changedBy?: string; reason?: string | null; wordCount?: number }>;
    // Revisión enriquecida
    qualityReport?: { score?: number; level?: string; recommendation?: string; issues?: Array<{ section?: string; type?: string; message: string }>; strengths?: string[] } | null;
    signOff?: { preparedByName?: string | null; preparedAt?: string | null; reviewedByName?: string | null; reviewedAt?: string | null; signedOffByName?: string | null; signedOffAt?: string | null };
    pbcLinks?: Array<{ code?: string; title?: string; status?: string }>;
    fieldEvidence?: FieldEvidencePdf[];
  };
}

// ─── S_EJE: Sampling execution result renderer ────────────────────────────────

function fmtUSD(n: number): string {
  return 'US$ ' + Number(n).toLocaleString('es-SV', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PARAM_LABELS_PDF: Record<string, string> = {
  valor_en_libros:           'Valor en Libros (BV)',
  materialidad_ejecucion:    'Materialidad de Ejecución (TM)',
  error_esperado:            'Error Esperado (EE)',
  nivel_confianza:           'Nivel de Confianza',
  factor_confianza:          'Factor de Confianza (RF)',
  poblacion:                 'Población (N)',
  tasa_desviacion_tolerable: 'Tasa Desv. Tolerable (TDR)',
  tasa_desviacion_esperada:  'Tasa Desv. Esperada (EDR)',
  metodo_seleccion:          'Método de Selección',
};
const MONETARY_PARAM_KEYS = new Set(['valor_en_libros', 'materialidad_ejecucion', 'error_esperado']);
const PCT_PARAM_KEYS       = new Set(['nivel_confianza', 'tasa_desviacion_tolerable', 'tasa_desviacion_esperada']);

// ─── MATRIX row extras (severity/note/evidence) — mirrors MatrixGridPanel.tsx ─
// Internal row keys are prefixed "_" (never a real column). When a paper opts into
// row extras (currently PT-FIN-B07 S1-S4) those rows carry "_nota"/"_attachments";
// their presence alone decides whether the PDF grows the extra columns, so any
// other MATRIX paper's plain rows render exactly as before.

type MatrixSeverity = 'high' | 'medium' | 'low' | null;

function isVarianceHeaderPdf(col: string): boolean {
  const n = col.toLowerCase();
  return n.includes('variac') && !n.includes('$');
}

function computeRowSeverityPdf(row: Record<string, unknown>, cols: string[]): MatrixSeverity {
  let maxAbs = -1;
  let usesPp = false;
  for (const col of cols) {
    if (!isVarianceHeaderPdf(col)) continue;
    const raw = row[col];
    if (raw == null || raw === '') continue;
    const n = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(n)) continue;
    if (col.toLowerCase().includes('pp')) usesPp = true;
    maxAbs = Math.max(maxAbs, Math.abs(n));
  }
  if (maxAbs < 0) return null;
  const [hi, med] = usesPp ? [5, 3] : [20, 10];
  if (maxAbs >= hi) return 'high';
  if (maxAbs >= med) return 'medium';
  return 'low';
}

const SEVERITY_BADGE_PDF: Record<'high' | 'medium' | 'low', { label: string; color: string; bg: string }> = {
  high:   { label: 'Alta',  color: '#B91C1C', bg: '#FEE2E2' },
  medium: { label: 'Media', color: '#B45309', bg: '#FEF3C7' },
  low:    { label: 'Baja',  color: '#047857', bg: '#D1FAE5' },
};

function renderSeverityBadgePdf(sev: MatrixSeverity): string {
  if (!sev) return '<span style="color:#A0AEC0;">—</span>';
  const s = SEVERITY_BADGE_PDF[sev];
  return `<span style="display:inline-block;padding:0.5mm 2mm;border-radius:3mm;font-size:7pt;font-weight:600;color:${s.color};background:${s.bg};">${s.label}</span>`;
}

/** MATRIX field values are arrays of row objects — render as a real table, not JSON. */
function renderMatrixTable(rows: unknown[]): string {
  const objRows = rows.filter(r => r && typeof r === 'object' && !Array.isArray(r)) as Array<Record<string, unknown>>;
  if (objRows.length === 0) return '<span class="text-muted text-small">— Sin datos —</span>';

  const allKeys  = Object.keys(objRows[0]);
  const cols     = allKeys.filter(k => !k.startsWith('_'));
  const hasExtras = allKeys.includes('_nota') || allKeys.includes('_attachments');

  return `
    <table class="text-small" style="width: 100%;">
      <thead><tr>
        ${cols.map(c => `<th>${esc(c)}</th>`).join('')}
        ${hasExtras ? '<th>Nivel de Atención</th><th>Nota del Auditor</th><th>Evidencia</th>' : ''}
      </tr></thead>
      <tbody>
        ${objRows.map(r => {
          const cells = cols.map(c => `<td>${esc(String(r[c] ?? '—'))}</td>`).join('');
          if (!hasExtras) return `<tr>${cells}</tr>`;

          const severity = computeRowSeverityPdf(r, cols);
          const nota = String(r['_nota'] ?? '').trim();
          let evidenceHtml = '<span class="text-muted">—</span>';
          try {
            const atts = JSON.parse(String(r['_attachments'] ?? '[]')) as Array<{ filename?: string }>;
            if (Array.isArray(atts) && atts.length > 0) {
              evidenceHtml = atts.map(a => esc(String(a.filename ?? 'archivo'))).join('<br/>');
            }
          } catch {
            // malformed/legacy _attachments payload — show as no evidence rather than breaking the PDF
          }

          return `<tr>
            ${cells}
            <td>${renderSeverityBadgePdf(severity)}</td>
            <td>${nota ? esc(nota) : '<span class="text-muted">—</span>'}</td>
            <td style="font-size:7pt;">${evidenceHtml}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function renderSamplingResult(val: Record<string, unknown>): string {
  const mode             = String(val['mode'] ?? 'MUS');
  const isMUS            = mode === 'MUS';
  const sampleSize       = Number(val['sample_size'] ?? 0);
  const totalItems       = Number(val['total_items'] ?? 0);
  const monetaryUnits    = val['monetary_units'] != null ? Number(val['monetary_units']) : null;
  const interval         = val['sampling_interval'] != null ? Number(val['sampling_interval']) : null;
  const executedAt       = val['executed_at'] ? new Date(String(val['executed_at'])).toLocaleString('es-SV') : '—';
  const params           = (val['parameters'] ?? {}) as Record<string, unknown>;
  const selected         = (val['selected'] ?? []) as Record<string, unknown>[];

  // Parameters table
  const paramsHtml = Object.entries(params).map(([k, v]) => {
    const label   = PARAM_LABELS_PDF[k] ?? k.replace(/_/g, ' ');
    const numV    = Number(v);
    const display = MONETARY_PARAM_KEYS.has(k) ? fmtUSD(numV)
                  : PCT_PARAM_KEYS.has(k)      ? `${v}%`
                  : String(v);
    return `<tr><td style="padding:2mm 3mm;border:1px solid #E2E8F0;color:#4A5568;">${esc(label)}</td>
                <td style="padding:2mm 3mm;border:1px solid #E2E8F0;font-weight:600;font-family:monospace;">${esc(display)}</td></tr>`;
  }).join('');

  // MUS extra metrics row
  const extraMetrics = isMUS ? `
    <div style="display:flex;gap:4mm;margin:3mm 0;">
      ${monetaryUnits != null ? `<div style="border:1px solid #D6BCFA;background:#FAF5FF;border-radius:2mm;padding:2mm 3mm;flex:1;">
        <p style="font-size:7pt;color:#6B46C1;text-transform:uppercase;margin:0 0 0.5mm 0;">n — Tamaño de Muestra MUS</p>
        <p style="font-size:12pt;font-weight:700;font-family:monospace;color:#553C9A;margin:0;">${monetaryUnits}</p>
        <p style="font-size:7pt;color:#805AD5;margin:0.5mm 0 0 0;">unidades monetarias (BV ÷ IMM)</p>
      </div>` : ''}
      <div style="border:1px solid #BEE3F8;background:#EBF8FF;border-radius:2mm;padding:2mm 3mm;flex:1;">
        <p style="font-size:7pt;color:#2B6CB0;text-transform:uppercase;margin:0 0 0.5mm 0;">Partidas en Muestra</p>
        <p style="font-size:12pt;font-weight:700;font-family:monospace;color:#2C5282;margin:0;">${sampleSize}</p>
        ${sampleSize === totalItems && monetaryUnits != null && monetaryUnits > totalItems
          ? '<p style="font-size:7pt;color:#C05621;margin:0.5mm 0 0 0;">⚠ Selección 100%</p>' : ''}
      </div>
      <div style="border:1px solid #E2E8F0;background:#F7FAFC;border-radius:2mm;padding:2mm 3mm;flex:1;">
        <p style="font-size:7pt;color:#718096;text-transform:uppercase;margin:0 0 0.5mm 0;">Partidas en Población (N)</p>
        <p style="font-size:12pt;font-weight:700;font-family:monospace;color:#2D3748;margin:0;">${totalItems}</p>
      </div>
      ${interval != null ? `<div style="border:1px solid #D6BCFA;background:#FAF5FF;border-radius:2mm;padding:2mm 3mm;flex:1;">
        <p style="font-size:7pt;color:#6B46C1;text-transform:uppercase;margin:0 0 0.5mm 0;">Intervalo de Muestreo (IMM)</p>
        <p style="font-size:12pt;font-weight:700;font-family:monospace;color:#553C9A;margin:0;">${esc(fmtUSD(interval))}</p>
      </div>` : ''}
    </div>` : `
    <div style="display:flex;gap:4mm;margin:3mm 0;">
      <div style="border:1px solid #BEE3F8;background:#EBF8FF;border-radius:2mm;padding:2mm 3mm;flex:1;">
        <p style="font-size:7pt;color:#2B6CB0;text-transform:uppercase;margin:0 0 0.5mm 0;">Muestra (n)</p>
        <p style="font-size:12pt;font-weight:700;font-family:monospace;color:#2C5282;margin:0;">${sampleSize}</p>
      </div>
      <div style="border:1px solid #E2E8F0;background:#F7FAFC;border-radius:2mm;padding:2mm 3mm;flex:1;">
        <p style="font-size:7pt;color:#718096;text-transform:uppercase;margin:0 0 0.5mm 0;">Partidas en Población (N)</p>
        <p style="font-size:12pt;font-weight:700;font-family:monospace;color:#2D3748;margin:0;">${totalItems}</p>
      </div>
    </div>`;

  // Selected items table — show max 200 rows to avoid huge PDFs
  const displayRows = selected.slice(0, 200);
  const hasMore     = selected.length > 200;
  const colKeys     = displayRows.length > 0 ? Object.keys(displayRows[0]).filter(k => k !== 'item') : [];
  const selectedTableHtml = displayRows.length > 0 ? `
    <div style="margin-top:4mm;">
      <p style="font-size:9pt;font-weight:700;color:#2D3748;margin:0 0 2mm 0;">Partidas Seleccionadas en la Muestra</p>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:8pt;">
          <thead>
            <tr style="background:#EBF8FF;">
              <th style="padding:2mm 3mm;border:1px solid #BEE3F8;text-align:left;color:#2C5282;white-space:nowrap;">#</th>
              ${colKeys.map(c => `<th style="padding:2mm 3mm;border:1px solid #BEE3F8;text-align:left;color:#2C5282;white-space:nowrap;text-transform:uppercase;font-size:7pt;">${esc(c)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${displayRows.map((row, i) => `
              <tr style="${i % 2 === 1 ? 'background:#F7FAFC;' : ''}">
                <td style="padding:1.5mm 3mm;border:1px solid #E2E8F0;color:#718096;font-family:monospace;">${i + 1}</td>
                ${colKeys.map(c => {
                  const v     = row[c];
                  const isMnt = c === 'monto' && isMUS;
                  const disp  = isMnt && typeof v === 'number' ? fmtUSD(v)
                              : isMnt && typeof v === 'string'  ? fmtUSD(parseFloat(v) || 0)
                              : esc(String(v ?? '—'));
                  return `<td style="padding:1.5mm 3mm;border:1px solid #E2E8F0;${isMnt ? 'font-family:monospace;color:#2C5282;font-weight:600;' : 'color:#4A5568;'}">${disp}</td>`;
                }).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
        ${hasMore ? `<p style="font-size:7pt;color:#718096;margin:1mm 0 0 0;">… y ${selected.length - 200} partidas más (ver Excel exportado para la lista completa)</p>` : ''}
      </div>
    </div>` : '';

  return `
    <div style="font-size:8pt;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2mm;">
        <span style="font-size:9pt;font-weight:700;color:#2D3748;">
          ${mode === 'MUS' ? 'MUS — Monetary Unit Sampling (NIA 530)' : 'Muestreo por Atributos (NIA 530)'}
        </span>
        <span style="font-size:7pt;color:#718096;">Ejecutado: ${esc(executedAt)}</span>
      </div>
      ${extraMetrics}
      <table style="border-collapse:collapse;font-size:8pt;margin-bottom:3mm;">
        <thead>
          <tr style="background:#F7FAFC;">
            <th style="padding:2mm 3mm;border:1px solid #E2E8F0;text-align:left;color:#718096;font-size:7pt;text-transform:uppercase;white-space:nowrap;">Parámetro</th>
            <th style="padding:2mm 3mm;border:1px solid #E2E8F0;text-align:left;color:#718096;font-size:7pt;text-transform:uppercase;">Valor</th>
          </tr>
        </thead>
        <tbody>${paramsHtml}</tbody>
      </table>
      ${selectedTableHtml}
    </div>`;
}

const FLOW_KIND_LABEL: Record<string, string> = {
  inicio_fin: 'Inicio/Fin', proceso: 'Proceso', decision: 'Decisión', documento: 'Documento',
};

/**
 * Apariencia por tipo de nodo — espejo EXACTO de KIND_SHAPE_CLASS en
 * FlowchartPanel.tsx (apps/web), para que el PDF se vea igual que el editor
 * en pantalla, no una aproximación. `inicio_fin` es un óvalo/píldora (rx =
 * mitad de la altura del nodo); el resto son rectángulos redondeados —
 * `decision` NO es un rombo en el editor real, solo cambia de color.
 */
const FLOW_NODE_STYLE: Record<string, { fill: string; stroke: string; dashed?: boolean; pill?: boolean }> = {
  inicio_fin: { fill: '#ecfdf5', stroke: '#34d399', pill: true },
  proceso:    { fill: '#eff6ff', stroke: '#60a5fa' },
  decision:   { fill: '#fffbeb', stroke: '#fbbf24' },
  documento:  { fill: '#f5f3ff', stroke: '#a78bfa', dashed: true },
};

const FLOW_NODE_W = 170;
const FLOW_NODE_H = 60;

/**
 * Diagrama SVG real del flujograma (FieldType.FLOWCHART) — mismas posiciones,
 * formas y colores que el editor `FlowchartPanel.tsx` en pantalla. Igual que
 * el radar de PT-COSO (`coso-pdf.ts`): SVG puro embebido en el HTML, sin
 * librería de gráficos — Chromium lo rasteriza nativo dentro de Puppeteer.
 * Las etiquetas usan `<foreignObject>` (un `<div>` normal con wrap de texto)
 * en vez de calcular saltos de línea a mano en `<tspan>` — mucho más
 * confiable para labels de largo variable.
 */
export function renderFlowchartDiagramSvg(val: Record<string, unknown>): string {
  const nodes = Array.isArray(val.nodes) ? val.nodes as Array<Record<string, unknown>> : [];
  if (nodes.length === 0) return '<span class="text-muted text-small">— Sin flujograma documentado —</span>';
  const edges = Array.isArray(val.edges) ? val.edges as Array<Record<string, unknown>> : [];
  const byId = new Map(nodes.map(n => [String(n.id), n]));

  const xs = nodes.map(n => Number(n.x) || 0);
  const ys = nodes.map(n => Number(n.y) || 0);
  const minX = Math.min(...xs) - 20, minY = Math.min(...ys) - 20;
  const maxX = Math.max(...xs) + FLOW_NODE_W + 20, maxY = Math.max(...ys) + FLOW_NODE_H + 20;
  const w = maxX - minX, h = maxY - minY;

  // Ancla el borde en el par de puntos correcto según la posición RELATIVA real
  // entre cada par de nodos — no se puede asumir flujo siempre de arriba hacia
  // abajo: el layout típico (`newNode()` en FlowchartPanel.tsx) coloca los
  // nodos en filas — dentro de una fila el flujo es horizontal (der/izq), y
  // solo al cambiar de fila es vertical. Se elige el eje dominante (dx vs dy)
  // entre los CENTROS de ambos nodos y se ancla en el borde correspondiente.
  const edgesSvg = edges.map(e => {
    const source = byId.get(String(e.source)), target = byId.get(String(e.target));
    if (!source || !target) return '';
    const sX = Number(source.x) || 0, sY = Number(source.y) || 0;
    const tX = Number(target.x) || 0, tY = Number(target.y) || 0;
    const scx = sX + FLOW_NODE_W / 2, scy = sY + FLOW_NODE_H / 2;
    const tcx = tX + FLOW_NODE_W / 2, tcy = tY + FLOW_NODE_H / 2;
    const dx = tcx - scx, dy = tcy - scy;
    let sx: number, sy: number, tx: number, ty: number, bend: number;
    if (Math.abs(dx) > Math.abs(dy)) {
      // Eje horizontal dominante — ancla en el lado derecho/izquierdo.
      sx = dx > 0 ? sX + FLOW_NODE_W : sX; sy = scy;
      tx = dx > 0 ? tX : tX + FLOW_NODE_W; ty = tcy;
      bend = Math.max(24, Math.abs(tx - sx) / 2);
      return `<path d="M ${sx},${sy} C ${sx + (dx > 0 ? bend : -bend)},${sy} ${tx + (dx > 0 ? -bend : bend)},${ty} ${tx},${ty}" fill="none" stroke="#94a3b8" stroke-width="1.6" marker-end="url(#flow-arrow)" />`;
    }
    // Eje vertical dominante — ancla en el borde inferior/superior.
    sx = scx; sy = dy > 0 ? sY + FLOW_NODE_H : sY;
    tx = tcx; ty = dy > 0 ? tY : tY + FLOW_NODE_H;
    bend = Math.max(24, Math.abs(ty - sy) / 2);
    return `<path d="M ${sx},${sy} C ${sx},${sy + (dy > 0 ? bend : -bend)} ${tx},${ty + (dy > 0 ? -bend : bend)} ${tx},${ty}" fill="none" stroke="#94a3b8" stroke-width="1.6" marker-end="url(#flow-arrow)" />`;
  }).join('');

  const nodesSvg = nodes.map(n => {
    const style = FLOW_NODE_STYLE[String(n.kind)] ?? FLOW_NODE_STYLE.proceso;
    const x = Number(n.x) || 0, y = Number(n.y) || 0;
    const rx = style.pill ? FLOW_NODE_H / 2 : 8;
    const dash = style.dashed ? ' stroke-dasharray="4 3"' : '';
    const linked = n.linkedPaper as Record<string, unknown> | undefined;
    const linkLine = linked
      ? `<div style="color:#2563eb;font-size:7.5px;margin-top:2px;">→ ${esc(String(linked.code ?? ''))}${linked.sectionLabel ? ` · ${esc(String(linked.sectionLabel))}` : ''}</div>`
      : '';
    return `
      <rect x="${x}" y="${y}" width="${FLOW_NODE_W}" height="${FLOW_NODE_H}" rx="${rx}" ry="${rx}"
            fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.6"${dash} />
      <foreignObject x="${x + 6}" y="${y + 4}" width="${FLOW_NODE_W - 12}" height="${FLOW_NODE_H - 8}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:inherit;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden;">
          <div style="font-size:9px;font-weight:600;color:#1e293b;line-height:1.15;">${esc(String(n.label ?? ''))}</div>
          <div style="font-size:7px;color:#64748b;margin-top:1px;">${esc(FLOW_KIND_LABEL[String(n.kind)] ?? String(n.kind ?? ''))}</div>
          ${linkLine}
        </div>
      </foreignObject>`;
  }).join('');

  return `
    <svg viewBox="${minX} ${minY} ${w} ${h}" width="170mm" height="${Math.min(230, Math.round((h / w) * 170))}mm" style="max-width:100%;">
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>
      ${edgesSvg}
      ${nodesSvg}
    </svg>`;
}

type ReportSection = NonNullable<WorkingPaperReportData['paper']['sections']>[number];

/** Renders a single section's value+attachments block — shared by the flat and tab-grouped layouts. */
function renderSectionBlock(s: ReportSection, isCoso: boolean): string {
  const val = s.value;
  let valStr = '';
  const isCosoQuestionGrid = isCoso && ['S1', 'S2', 'S3', 'S4', 'S5'].includes(s.sectionKey) && Array.isArray(val);
  if (val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) {
    valStr = '<span class="text-muted text-small">— Sin completar —</span>';
  } else if (isCosoQuestionGrid) {
    // PT-COSO S1-S5: una fila por pregunta, agrupadas por Principio con tally Sí/No/N-A.
    valStr = renderCosoQuestionTable(val as unknown[]);
  } else if (s.fieldType === 'SAMPLE_ITEM_REGISTER' && Array.isArray(val)) {
    // PT-NIA530 S5: ítems de muestra con valor en libros/auditado, diferencia y tainting %.
    valStr = renderSampleItemRegisterTable(val);
  } else if (Array.isArray(val)) {
    // MATRIX-type sections: array of row objects → real table, not a JSON dump.
    valStr = renderMatrixTable(val);
  } else if (typeof val === 'object' && s.fieldType === 'SAMPLING_EVALUATION') {
    // PT-NIA530 S4: MLE/Precisión Básica/UEL calculados + semáforo por área.
    valStr = renderSamplingEvaluationBlock(val);
  } else if (typeof val === 'object' && s.fieldType === 'FLOWCHART') {
    valStr = renderFlowchartDiagramSvg(val as Record<string, unknown>);
  } else if (typeof val === 'object' && s.sectionKey === 'S_EJE') {
    valStr = renderSamplingResult(val as Record<string, unknown>);
  } else if (typeof val === 'object') {
    valStr = `<pre class="pre-wrap text-small">${esc(JSON.stringify(val, null, 2))}</pre>`;
  } else if (s.fieldType === 'CURRENCY') {
    const n = Number(val);
    valStr = isNaN(n)
      ? `<span class="pre-wrap">${esc(String(val))}</span>`
      : `<span class="pre-wrap" style="font-family:monospace;font-weight:600;">${esc(fmtUSD(n))}</span>`;
  } else if (s.fieldType === 'PERCENTAGE') {
    valStr = `<span class="pre-wrap">${esc(String(val))}%</span>`;
  } else if (s.fieldType === 'ENUM_SELECT') {
    const humanized = String(val)
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
    valStr = `<span class="pre-wrap">${esc(humanized)}</span>`;
  } else if (s.fieldType === 'BOOLEAN') {
    valStr = `<span class="pre-wrap">${val ? 'Sí' : 'No'}</span>`;
  } else {
    valStr = `<span class="pre-wrap">${esc(String(val))}</span>`;
  }
  const sAtts = s.attachments ?? [];
  const attsHtml = sAtts.length > 0
    ? `<div style="margin-top: 1.5mm;">
         <p class="text-small text-muted" style="margin: 0 0 0.5mm 0;">📎 Documentos de soporte:</p>
         <ul style="margin: 0; padding-left: 5mm;">
           ${sAtts.map(a => `<li class="text-small">${esc(a.filename)}</li>`).join('')}
         </ul>
       </div>`
    : '';
  return `
    <div class="no-break" style="margin-bottom: 4mm;">
      <h3 style="margin-bottom: 1mm;">${esc(s.label)}</h3>
      <div>${valStr}</div>
      ${attsHtml}
    </div>`;
}

export function renderWorkingPaperBody(data: WorkingPaperReportData): string {
  const wp = data.paper;
  const sections = wp.sections ?? [];
  const isCoso = wp.paperCode === 'PT-COSO';

  // Sections — PT-COSO groups by pestaña (tab) with a page break between groups and
  // inserts the score/bandas/gráficos block at the top of "Resultados y Conclusión",
  // mirroring the on-screen layout (SmartPaperSections.tsx). Every other paper keeps
  // the original flat, tab-agnostic layout untouched.
  let sectionsHtml: string;
  if (sections.length === 0) {
    sectionsHtml = '<p class="text-muted text-small">Este papel no tiene secciones estructuradas.</p>';
  } else if (isCoso && sections.some(s => s.tab)) {
    const tabOrder: string[] = [];
    const byTab = new Map<string, ReportSection[]>();
    for (const s of sections) {
      const tab = s.tab ?? '';
      if (!byTab.has(tab)) { byTab.set(tab, []); tabOrder.push(tab); }
      byTab.get(tab)!.push(s);
    }
    sectionsHtml = tabOrder.map((tab, i) => {
      const tabSections = byTab.get(tab)!;
      const isResultsTab = /resultados/i.test(tab);
      return `
        ${i > 0 ? '<div class="page-break"></div>' : ''}
        <h1>${esc(tab || 'Otras secciones')}</h1>
        ${isResultsTab ? renderCosoResultsBlock(sections.map(s => ({ sectionKey: s.sectionKey, value: s.value }))) : ''}
        ${tabSections.map(s => renderSectionBlock(s, isCoso)).join('')}
      `;
    }).join('');
  } else {
    sectionsHtml = sections.map(s => renderSectionBlock(s, isCoso)).join('');
  }

  // Procedures
  const procedures = wp.content?.procedures ?? [];
  const proceduresHtml = procedures.length > 0
    ? procedures.map((p, i) => {
        const atts = p.attachments ?? [];
        const refs = p.crossRefs ?? [];
        return `
        <div class="no-break" style="margin-bottom: 5mm; border: 1px solid #E2E8F0; border-radius: 3mm; padding: 4mm;">
          <h3 style="margin: 0 0 1.5mm 0;">
            ${i + 1}. ${esc(p.title ?? p.area ?? 'Procedimiento')}
            ${p.niaRef ? `<span style="font-size: 8pt; color: #2C5282; background: #BEE3F8; padding: 0.5mm 1.5mm; border-radius: 2mm; margin-left: 2mm;">${esc(p.niaRef)}</span>` : ''}
          </h3>
          <p class="pre-wrap" style="margin: 0 0 2mm 0;">${esc(p.statement ?? p.procedure ?? '')}</p>
          ${p.development ? `
            <div style="background: #F7FAFC; border-left: 2px solid #0F2D4A; padding: 2mm 3mm; margin-top: 2mm;">
              <p style="font-size: 8pt; font-weight: 600; color: #718096; text-transform: uppercase; margin: 0 0 1mm 0;">Desarrollo</p>
              <p class="pre-wrap text-small" style="margin: 0;">${esc(p.development)}</p>
            </div>` : ''}
          ${atts.length > 0 ? `
            <div style="margin-top: 2mm;">
              <p style="font-size: 8pt; font-weight: 600; color: #718096; text-transform: uppercase; margin: 0 0 1mm 0;">📎 Soportes adjuntos</p>
              <ul style="margin: 0; padding-left: 5mm; font-size: 9pt;">
                ${atts.map(a => `<li>${esc(a.filename)}${a.size ? ` <span class="text-muted">(${(a.size / 1024).toFixed(0)} KB)</span>` : ''}</li>`).join('')}
              </ul>
            </div>` : ''}
          ${refs.length > 0 ? `
            <div style="margin-top: 2mm;">
              <p style="font-size: 8pt; font-weight: 600; color: #718096; text-transform: uppercase; margin: 0 0 1mm 0;">🔗 Referencias cruzadas</p>
              <p style="margin: 0; font-size: 9pt;">${refs.map(r => `<span style="background: #EBF8FF; color: #2C5282; padding: 0.5mm 1.5mm; border-radius: 2mm; margin-right: 1.5mm;">${esc(r.code)} — ${esc(r.title)}</span>`).join('')}</p>
            </div>` : ''}
        </div>`;
      }).join('')
    : '';

  // ── Grafo de conocimiento ──
  const sourceLinks = wp.sourceLinks ?? [];
  const targetLinks = wp.targetLinks ?? [];
  const graphHtml = (sourceLinks.length > 0 || targetLinks.length > 0) ? `
    <div class="page-break"></div>
    <h1>Grafo de Conocimiento</h1>
    <p class="text-small text-muted">Flujo de datos entre este papel y otros papeles del expediente.</p>
    ${targetLinks.length > 0 ? `
      <h2>Este papel recibe de (fuentes)</h2>
      <table>
        <thead><tr><th>Papel fuente</th><th>Campo origen → destino</th><th>Tipo</th></tr></thead>
        <tbody>${targetLinks.map(l => `
          <tr><td>${esc(l.sourceCode ?? '')} ${esc(l.sourceTitle ?? '')}</td>
              <td class="text-small">${esc(l.sourceField ?? '')} → ${esc(l.targetField ?? '')}</td>
              <td class="text-small">${esc(l.mappingType ?? 'DIRECT')}</td></tr>`).join('')}</tbody>
      </table>` : ''}
    ${sourceLinks.length > 0 ? `
      <h2>Este papel alimenta a (dependientes)</h2>
      <table>
        <thead><tr><th>Papel destino</th><th>Campo origen → destino</th><th>Tipo</th></tr></thead>
        <tbody>${sourceLinks.map(l => `
          <tr><td>${esc(l.targetCode ?? '')} ${esc(l.targetTitle ?? '')}</td>
              <td class="text-small">${esc(l.sourceField ?? '')} → ${esc(l.targetField ?? '')}</td>
              <td class="text-small">${esc(l.mappingType ?? 'DIRECT')}</td></tr>`).join('')}</tbody>
      </table>` : ''}
  ` : '';

  // ── Revisión (matriz de firmas + quality gate + comentarios + PBC) ──
  const comments = wp.comments ?? [];
  const qr = wp.qualityReport;
  const so = wp.signOff;
  const pbcLinks = wp.pbcLinks ?? [];
  const hasReviewContent = comments.length > 0 || qr || so || pbcLinks.length > 0;

  const reviewHtml = hasReviewContent ? `
    <div class="page-break"></div>
    <h1>Revisión y Control de Calidad</h1>

    ${so ? `
      <h2>Matriz de Firmas</h2>
      <table>
        <thead><tr><th>Rol</th><th>Responsable</th><th style="width: 32mm;">Fecha</th></tr></thead>
        <tbody>
          <tr><td>Preparado por</td><td>${esc(so.preparedByName ?? '—')}</td><td class="text-small">${so.preparedAt ? fmtDate(so.preparedAt) : 'Sin firma'}</td></tr>
          <tr><td>Revisado por</td><td>${esc(so.reviewedByName ?? '—')}</td><td class="text-small">${so.reviewedAt ? fmtDate(so.reviewedAt) : 'Sin firma'}</td></tr>
          <tr><td>Firmado por (CAE/Socio)</td><td>${esc(so.signedOffByName ?? '—')}</td><td class="text-small">${so.signedOffAt ? fmtDate(so.signedOffAt) : 'Sin firma'}</td></tr>
        </tbody>
      </table>` : ''}

    ${qr ? `
      <h2>Gate de Calidad Semántica</h2>
      <div class="meta-strip">
        <div class="kv">
          <div><span class="kv-label">Puntaje:</span> ${qr.score ?? '—'}/100 ${qr.level ? `· <strong>${esc(qr.level)}</strong>` : ''}</div>
          ${qr.recommendation ? `<div style="margin-top: 1mm;"><span class="kv-label">Recomendación:</span> ${esc(qr.recommendation)}</div>` : ''}
        </div>
      </div>
      ${(qr.issues ?? []).length > 0 ? `
        <h3>Observaciones (${qr.issues!.length})</h3>
        <table>
          <thead><tr><th style="width: 40mm;">Sección</th><th style="width: 28mm;">Tipo</th><th>Descripción</th></tr></thead>
          <tbody>${qr.issues!.map(iss => `
            <tr><td>${esc(iss.section ?? '—')}</td><td class="text-small">${esc(iss.type ?? '')}</td><td class="pre-wrap text-small">${esc(iss.message)}</td></tr>`).join('')}</tbody>
        </table>` : ''}
      ${(qr.strengths ?? []).length > 0 ? `
        <h3>Fortalezas</h3>
        <ul style="font-size: 9.5pt;">${qr.strengths!.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    ` : ''}

    ${pbcLinks.length > 0 ? `
      <h2>Evidencias PBC Vinculadas</h2>
      <table>
        <thead><tr><th style="width: 20mm;">Código</th><th>Solicitud</th><th style="width: 24mm;">Estado</th></tr></thead>
        <tbody>${pbcLinks.map(p => `
          <tr><td class="text-small">${esc(p.code ?? '')}</td><td>${esc(p.title ?? '')}</td><td class="text-small">${esc(p.status ?? '')}</td></tr>`).join('')}</tbody>
      </table>` : ''}

    ${comments.length > 0 ? `
      <h2>Notas de Revisión</h2>
      <table>
        <thead><tr><th style="width: 26mm;">Fecha</th><th>Comentario</th><th style="width: 22mm;">Estado</th></tr></thead>
        <tbody>${comments.map(c => `
          <tr><td class="text-small">${c.createdAt ? fmtDate(c.createdAt) : '—'}</td>
              <td class="pre-wrap">${esc(c.content)}</td>
              <td class="text-small">${c.resolved ? '<span class="badge badge-low">Resuelto</span>' : '<span class="badge badge-medium">Abierto</span>'}</td></tr>`).join('')}</tbody>
      </table>` : ''}
  ` : '';

  // ── Historial de versiones ──
  const versions = wp.versions ?? [];
  const historyHtml = versions.length > 0 ? `
    <div class="page-break"></div>
    <h1>Historial de Versiones</h1>
    <p class="text-small text-muted">NIA 230 — Trazabilidad de la documentación de auditoría.</p>
    <table>
      <thead><tr><th style="width: 14mm;">Versión</th><th style="width: 28mm;">Fecha</th><th style="width: 34mm;">Autor</th><th>Razón</th></tr></thead>
      <tbody>${versions.map(v => `
        <tr><td style="font-weight: 600;">v${v.version}</td>
            <td class="text-small">${v.changedAt ? fmtDate(v.changedAt) : '—'}</td>
            <td class="text-small">${esc(v.changedBy ?? '—')}</td>
            <td class="text-small">${esc(v.reason ?? '—')}</td></tr>`).join('')}</tbody>
    </table>
  ` : '';

  return `
    <div class="meta-strip">
      <div class="grid-2">
        <div class="kv">
          <div><span class="kv-label">Código:</span> ${esc(wp.paperCode ?? wp.code)}</div>
          <div><span class="kv-label">Auditoría:</span> ${esc(wp.audit.title)}</div>
          <div><span class="kv-label">Sección:</span> ${esc(wp.indexSection)}</div>
          <div><span class="kv-label">Elaborado por:</span> ${esc(wp.preparedBy?.name ?? 'Sin asignar')}</div>
        </div>
        <div class="kv">
          <div><span class="kv-label">Tipo:</span> ${esc(wp.type)} · ${esc(wp.wpKind)}</div>
          <div><span class="kv-label">Estado:</span> ${esc(wp.status)}${wp.version ? ` · v${wp.version}` : ''}</div>
          <div><span class="kv-label">Revisado por:</span> ${esc(wp.reviewedBy?.name ?? 'Sin asignar')}</div>
          ${wp.qualityScore != null ? `<div><span class="kv-label">Calidad:</span> ${wp.qualityScore}/100</div>` : ''}
        </div>
      </div>
    </div>

    ${wp.narrative ? `<h2>Narrativa</h2><p class="pre-wrap">${esc(wp.narrative)}</p>` : ''}

    ${isCoso ? '' : '<h2>Secciones del Papel</h2>'}
    ${sectionsHtml}

    ${renderFieldEvidenceBlock(wp.fieldEvidence ?? [])}

    ${proceduresHtml ? `<h2>Procedimientos</h2>${proceduresHtml}` : ''}

    ${wp.conclusion ? `<h2>Conclusión</h2><blockquote class="pre-wrap">${esc(wp.conclusion)}</blockquote>` : ''}

    ${graphHtml}
    ${reviewHtml}
    ${historyHtml}

    <div class="signature-block">
      <div class="grid-2">
        <div>
          <span class="signature-line"></span><br/>
          <span class="text-small text-muted">Preparado por: ${esc(wp.preparedBy?.name ?? '________________')}</span>
          ${wp.preparedAt ? `<br/><span class="text-small text-muted">${fmtDate(wp.preparedAt)}</span>` : ''}
        </div>
        <div>
          <span class="signature-line"></span><br/>
          <span class="text-small text-muted">Revisado por: ${esc(wp.reviewedBy?.name ?? '________________')}</span>
          ${wp.reviewedAt ? `<br/><span class="text-small text-muted">${fmtDate(wp.reviewedAt)}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}
