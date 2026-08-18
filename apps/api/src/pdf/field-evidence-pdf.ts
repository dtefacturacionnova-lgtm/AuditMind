/**
 * Renderizado PDF de Evidencia de Campo (EVD-01..14) — panel independiente de
 * las secciones del papel (vive en su propia tabla `field_evidences`, no en
 * `paper_sections`), así que el export a PDF necesita su propio bloque: el
 * generador de HTML de trabajo (pdf-templates.ts) nunca la consulta por sí
 * solo. Espejo simplificado de FieldEvidencePanel.tsx (pantalla) — sin
 * reproducir audio/video/foto (no aplica en PDF), pero con la cita textual
 * completa de cada hallazgo, que es lo que sostiene la evidencia.
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

function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-SV', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return String(iso); }
}

const KIND_LABEL: Record<string, string> = {
  TEXT_NOTE:       'Nota de texto',
  AUDIO_NOTE:      'Nota de voz',
  INTERVIEW_AUDIO: 'Entrevista formal (audio)',
  SHORT_VIDEO:     'Video corto',
  ANNOTATED_PHOTO: 'Foto anotada',
};

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  UPLOADED:     { label: 'Subida — sin procesar',       color: '#718096', bg: '#F7FAFC' },
  TRANSCRIBING: { label: 'Transcribiendo',                color: '#B45309', bg: '#FFFBEB' },
  EXTRACTING:   { label: 'Extrayendo hallazgos',          color: '#B45309', bg: '#FFFBEB' },
  READY:        { label: 'Lista — hallazgos disponibles', color: '#047857', bg: '#ECFDF5' },
  FAILED:       { label: 'Falló el procesamiento',        color: '#B91C1C', bg: '#FEF2F2' },
};

const DISPOSITION_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Sin revisar',            color: '#B45309', bg: '#FFFBEB' },
  ACCEPTED:  { label: 'Aceptado',               color: '#047857', bg: '#ECFDF5' },
  DISCARDED: { label: 'Descartado',             color: '#718096', bg: '#F7FAFC' },
  PROMOTED:  { label: 'Promovido a hallazgo',   color: '#6B21A8', bg: '#F5F3FF' },
};

const RISK_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  bajo:  { label: 'Riesgo bajo',  color: '#047857', bg: '#ECFDF5' },
  medio: { label: 'Riesgo medio', color: '#B45309', bg: '#FFFBEB' },
  alto:  { label: 'Riesgo alto',  color: '#B91C1C', bg: '#FEF2F2' },
};

function badge(cfg: { label: string; color: string; bg: string } | undefined, fallback: string): string {
  if (!cfg) return `<span style="color:#A0AEC0;">${esc(fallback)}</span>`;
  return `<span style="display:inline-block;padding:0.5mm 2mm;border-radius:3mm;font-size:7pt;font-weight:700;color:${cfg.color};background:${cfg.bg};">${esc(cfg.label)}</span>`;
}

export interface FieldEvidenceFindingPdf {
  tipo?: string;
  descripcion?: string;
  citaTextual?: string;
  fuenteRef?: string | null;
  nivelRiesgo?: string;
  disposition?: string;
}

export interface FieldEvidencePdf {
  kind?: string;
  status?: string;
  capturedAt?: string | Date | null;
  capturedByName?: string;
  lugar?: string | null;
  descripcion?: string | null;
  consentimiento?: boolean;
  filename?: string | null;
  textoOriginal?: string | null;
  transcript?: { texto?: string } | null;
  anotaciones?: unknown[] | null;
  findings?: FieldEvidenceFindingPdf[];
}

function evidenceContentHtml(e: FieldEvidencePdf): string {
  if (e.kind === 'TEXT_NOTE' && e.textoOriginal) {
    return `<p class="pre-wrap" style="margin:2mm 0 0 0;">${esc(e.textoOriginal)}</p>`;
  }
  const texto = e.transcript?.texto?.trim();
  if (texto) {
    return `
      <div style="background:#F8FAFC;border-left:2px solid #0F2D4A;padding:2mm 3mm;margin-top:2mm;">
        <p style="font-size:7pt;font-weight:700;color:#718096;text-transform:uppercase;margin:0 0 1mm 0;">Transcripción</p>
        <p class="pre-wrap text-small" style="margin:0;">${esc(texto)}</p>
      </div>`;
  }
  if (e.kind === 'ANNOTATED_PHOTO') {
    const n = Array.isArray(e.anotaciones) ? e.anotaciones.length : 0;
    return `<p class="text-small text-muted" style="margin:2mm 0 0 0;">Foto con ${n} anotación(es) — ver imagen original en la plataforma.</p>`;
  }
  return '<p class="text-small text-muted" style="margin:2mm 0 0 0;">Sin transcripción disponible (procesamiento pendiente o fallido).</p>';
}

function findingsTableHtml(findings: FieldEvidenceFindingPdf[]): string {
  if (findings.length === 0) return '';
  return `
    <table class="text-small" style="width:100%;margin-top:2mm;">
      <thead><tr>
        <th style="width:26mm;">Tipo</th><th>Descripción</th><th>Cita textual</th>
        <th style="width:20mm;">Riesgo</th><th style="width:26mm;">Disposición</th>
      </tr></thead>
      <tbody>
        ${findings.map(f => `
          <tr>
            <td class="text-small">${esc(f.tipo ?? '—').replace(/_/g, ' ')}</td>
            <td class="pre-wrap text-small">${esc(f.descripcion ?? '')}</td>
            <td class="pre-wrap text-small" style="font-style:italic;color:#4A5568;">&ldquo;${esc(f.citaTextual ?? '')}&rdquo;${f.fuenteRef ? ` <span class="text-muted">(${esc(f.fuenteRef)})</span>` : ''}</td>
            <td>${badge(f.nivelRiesgo ? RISK_LABEL[f.nivelRiesgo] : undefined, f.nivelRiesgo ?? '—')}</td>
            <td>${badge(f.disposition ? DISPOSITION_LABEL[f.disposition] : undefined, f.disposition ?? '—')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function evidenceCardHtml(e: FieldEvidencePdf, i: number): string {
  const findings = e.findings ?? [];
  return `
    <div class="no-break" style="border:1px solid #E2E8F0;border-radius:3mm;padding:3mm;margin-bottom:3mm;background:#FFFFFF;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:2mm;flex-wrap:wrap;">
        <div>
          <p style="font-size:9pt;font-weight:700;color:#2D3748;margin:0;">
            ${i + 1}. ${esc(KIND_LABEL[e.kind ?? ''] ?? e.kind ?? 'Evidencia')}
          </p>
          <p style="font-size:7pt;color:#94A3B8;margin:0.5mm 0 0 0;">
            ${fmtDate(e.capturedAt)} &middot; Capturado por ${esc(e.capturedByName ?? '—')}
            ${e.lugar ? ` &middot; ${esc(e.lugar)}` : ''}
          </p>
        </div>
        <div style="display:flex;gap:1.5mm;flex-wrap:wrap;justify-content:flex-end;">
          ${e.kind === 'INTERVIEW_AUDIO' ? badge(
            e.consentimiento ? { label: 'Con consentimiento', color: '#047857', bg: '#ECFDF5' } : { label: 'Sin consentimiento', color: '#B91C1C', bg: '#FEF2F2' },
            '—',
          ) : ''}
          ${badge(e.status ? STATUS_LABEL[e.status] : undefined, e.status ?? '—')}
        </div>
      </div>

      ${e.descripcion ? `<p class="text-small text-muted" style="margin:1.5mm 0 0 0;">${esc(e.descripcion)}</p>` : ''}
      ${e.filename ? `<p class="text-small" style="margin:1mm 0 0 0;">📎 ${esc(e.filename)}</p>` : ''}

      ${evidenceContentHtml(e)}
      ${findings.length > 0 ? `
        <p style="font-size:7pt;font-weight:700;color:#718096;text-transform:uppercase;margin:2.5mm 0 0 0;">
          Hallazgos identificados (${findings.length})
        </p>
        ${findingsTableHtml(findings)}` : ''}
    </div>`;
}

export function renderFieldEvidenceBlock(items: FieldEvidencePdf[]): string {
  if (!items || items.length === 0) return '';
  const totalFindings = items.reduce((s, e) => s + (e.findings?.length ?? 0), 0);
  return `
    <h2>Evidencia de Campo</h2>
    <p class="text-small text-muted" style="margin-top:-2mm;">
      ${items.length} evidencia(s) capturada(s) en campo &middot; ${totalFindings} hallazgo(s) sugerido(s) por IA a partir de ellas (NIA 500/610).
    </p>
    ${items.map((e, i) => evidenceCardHtml(e, i)).join('')}
  `;
}
