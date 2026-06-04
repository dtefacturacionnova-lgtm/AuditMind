/**
 * Plantillas HTML para PDF — funciones puras que toman datos y devuelven HTML body.
 * Se envuelven con PdfService.renderBrandedLayout(...).
 */

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
    conclusion?: string | null;
    narrative?: string | null;
    preparedBy?: { name: string } | null;
    reviewedBy?: { name: string } | null;
    preparedAt?: string | null;
    reviewedAt?: string | null;
    audit: { title: string };
    sections?: Array<{ sectionKey: string; label: string; value: unknown; fieldType: string }>;
    content?: { procedures?: Array<{ title?: string; statement?: string; procedure?: string; development?: string; area?: string; niaRef?: string }> };
  };
}

export function renderWorkingPaperBody(data: WorkingPaperReportData): string {
  const wp = data.paper;

  // Sections
  const sectionsHtml = (wp.sections ?? []).length > 0
    ? (wp.sections ?? []).map(s => {
        const val = s.value;
        let valStr = '';
        if (val === null || val === undefined || val === '') {
          valStr = '<span class="text-muted text-small">— Sin completar —</span>';
        } else if (typeof val === 'object') {
          valStr = `<pre class="pre-wrap text-small">${esc(JSON.stringify(val, null, 2))}</pre>`;
        } else {
          valStr = `<span class="pre-wrap">${esc(String(val))}</span>`;
        }
        return `
          <div class="no-break" style="margin-bottom: 4mm;">
            <h3 style="margin-bottom: 1mm;">${esc(s.label)}</h3>
            <div>${valStr}</div>
          </div>`;
      }).join('')
    : '<p class="text-muted text-small">Este papel no tiene secciones estructuradas.</p>';

  // Procedures
  const procedures = wp.content?.procedures ?? [];
  const proceduresHtml = procedures.length > 0
    ? procedures.map((p, i) => `
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
        </div>`).join('')
    : '';

  return `
    <div class="meta-strip">
      <div class="grid-2">
        <div class="kv">
          <div><span class="kv-label">Código:</span> ${esc(wp.paperCode ?? wp.code)}</div>
          <div><span class="kv-label">Auditoría:</span> ${esc(wp.audit.title)}</div>
          <div><span class="kv-label">Sección:</span> ${esc(wp.indexSection)}</div>
        </div>
        <div class="kv">
          <div><span class="kv-label">Tipo:</span> ${esc(wp.type)}</div>
          <div><span class="kv-label">Clase:</span> ${esc(wp.wpKind)}</div>
          <div><span class="kv-label">Estado:</span> ${esc(wp.status)}</div>
        </div>
      </div>
    </div>

    ${wp.narrative ? `<h2>Narrativa</h2><p class="pre-wrap">${esc(wp.narrative)}</p>` : ''}

    <h2>Secciones del Papel</h2>
    ${sectionsHtml}

    ${proceduresHtml ? `<h2>Procedimientos</h2>${proceduresHtml}` : ''}

    ${wp.conclusion ? `<h2>Conclusión</h2><blockquote class="pre-wrap">${esc(wp.conclusion)}</blockquote>` : ''}

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
