'use client';

/**
 * WorkingPaperIndexReport — Reporte PDF completo de Auditoría
 * ─────────────────────────────────────────────────────────────
 * Genera un PDF abriendo una ventana nueva con el HTML del reporte.
 * Todas las secciones usan estilos inline → el outerHTML se preserva
 * perfectamente en la ventana nueva sin dependencias externas.
 *
 * Secciones:
 *  0. Portada
 *  1. Resumen de la Auditoría
 *  2. Equipo Asignado
 *  3. Expediente (árbol de fases / carpetas / papeles)
 *  4. Hallazgos
 *  5. Horas Registradas
 *  6. Portal de Clientes (PBC)
 *  7. Confirmaciones Externas
 *  A. Matriz de Firmas
 *  B. Notas de Revisión Abiertas
 */

import { X, Printer, FileText } from 'lucide-react';
import { useAudit } from '@/hooks/useAudits';
import { useExpediente, PHASE_CONFIG, type AuditFolder, type WpStub } from '@/hooks/useExpediente';
import { useWorkingPapersForAudit, type WorkingPaper } from '@/hooks/useWorkingPapers';
import { useSignOffMatrix, type SignOffMatrixRow } from '@/hooks/useWorkingPaperSignOff';
import { useFindingsByAudit } from '@/hooks/useFindings';
import { useAuditTimeEntries } from '@/hooks/usePlans';
import { usePbcRequestsForAudit } from '@/hooks/usePbc';
import { useConfirmationsForAudit } from '@/hooks/useConfirmations';

// ─── Colores / estilos reutilizables ─────────────────────────────────────────

const C = {
  navy:     '#0f2d4a',
  blue:     '#1d4ed8',
  indigo:   '#4f46e5',
  violet:   '#7c3aed',
  green:    '#065f46',
  amber:    '#92400e',
  red:      '#991b1b',
  gray:     '#374151',
  grayMid:  '#6b7280',
  grayLight:'#9ca3af',
  border:   '#e5e7eb',
};

const TH: React.CSSProperties = {
  padding: '4px 8px', fontSize: 8, fontWeight: 700,
  color: C.grayMid, textTransform: 'uppercase', letterSpacing: '0.05em',
  borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', background: '#f9fafb',
};
const TD: React.CSSProperties = {
  padding: '5px 8px', fontSize: 9, borderBottom: `1px solid #f3f4f6`, verticalAlign: 'top',
};

// ─── File-type tag ────────────────────────────────────────────────────────────

const EXT_TAGS: { ext: string; label: string; color: string; bg: string }[] = [
  { ext: '.xlsx', label: 'XLS', color: '#166534', bg: '#dcfce7' },
  { ext: '.xls',  label: 'XLS', color: '#166534', bg: '#dcfce7' },
  { ext: '.docx', label: 'DOC', color: '#1e40af', bg: '#dbeafe' },
  { ext: '.doc',  label: 'DOC', color: '#1e40af', bg: '#dbeafe' },
  { ext: '.pptx', label: 'PPT', color: '#c2410c', bg: '#ffedd5' },
  { ext: '.ppt',  label: 'PPT', color: '#c2410c', bg: '#ffedd5' },
  { ext: '.pdf',  label: 'PDF', color: '#991b1b', bg: '#fee2e2' },
  { ext: '.mp3',  label: 'AUD', color: '#6b21a8', bg: '#f3e8ff' },
  { ext: '.mp4',  label: 'VID', color: '#0369a1', bg: '#e0f2fe' },
  { ext: '.png',  label: 'IMG', color: '#be185d', bg: '#fce7f3' },
  { ext: '.jpg',  label: 'IMG', color: '#be185d', bg: '#fce7f3' },
  { ext: '.jpeg', label: 'IMG', color: '#be185d', bg: '#fce7f3' },
];
const MIME_TAGS: { test: (m: string) => boolean; label: string; color: string; bg: string }[] = [
  { test: m => m.includes('spreadsheet') || m.includes('excel'), label: 'XLS', color: '#166534', bg: '#dcfce7' },
  { test: m => m.includes('presentation') || m.includes('powerpoint'), label: 'PPT', color: '#c2410c', bg: '#ffedd5' },
  { test: m => m.startsWith('audio/'),  label: 'AUD', color: '#6b21a8', bg: '#f3e8ff' },
  { test: m => m.startsWith('video/'),  label: 'VID', color: '#0369a1', bg: '#e0f2fe' },
  { test: m => m.startsWith('image/'),  label: 'IMG', color: '#be185d', bg: '#fce7f3' },
  { test: m => m === 'application/pdf', label: 'PDF', color: '#991b1b', bg: '#fee2e2' },
  { test: m => m.includes('word') || m.includes('document'), label: 'DOC', color: '#1e40af', bg: '#dbeafe' },
];
function getTag(stub: WpStub) {
  if (stub.mimeType) {
    const f = MIME_TAGS.find(({ test }) => test(stub.mimeType!));
    if (f) return f;
  }
  if (stub.originalFilename) {
    const lower = stub.originalFilename.toLowerCase();
    const f = EXT_TAGS.find(({ ext }) => lower.endsWith(ext));
    if (f) return f;
  }
  return { label: 'PT', color: C.gray, bg: '#f3f4f6' };
}

// ─── Label maps ──────────────────────────────────────────────────────────────

const WP_TYPE_LABEL: Record<string, string> = {
  PLANNING_UNDERSTANDING: 'Planificación',
  CONTROL_EVALUATION:     'Controles',
  SUBSTANTIVE_TEST:       'Pruebas Sust.',
  DATA_ANALYSIS:          'Análisis Datos',
  FINDING:                'Hallazgo',
  CLOSURE_CONCLUSION:     'Cierre',
  INTERVIEW:              'Entrevista',
  CONFIRMATION:           'Confirmación',
  NORMATIVE_ANALYSIS:     'Análisis Norm.',
};

const STATUS_PRINT: Record<string, { label: string; color: string; bg: string; border: string }> = {
  NOT_STARTED:    { label: 'No iniciado',    color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  IN_PROGRESS:    { label: 'En progreso',    color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  PENDING_REVIEW: { label: 'Pend. revisión', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  RETURNED:       { label: 'Devuelto',       color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  REVIEWED:       { label: 'Revisado',       color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  SIGNED_OFF:     { label: 'Firmado',        color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' },
  CLOSED:         { label: 'Cerrado',        color: '#047857', bg: '#d1fae5', border: '#6ee7b7' },
  DRAFT:          { label: 'Borrador',       color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  IN_REVIEW:      { label: 'En revisión',    color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  APPROVED:       { label: 'Aprobado',       color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' },
  ARCHIVED:       { label: 'Archivado',      color: '#374151', bg: '#f3f4f6', border: '#d1d5db' },
  OPEN:           { label: 'Abierto',        color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  RESOLVED:       { label: 'Resuelto',       color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' },
  OVERDUE:        { label: 'Vencido',        color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
  PENDING:        { label: 'Pendiente',      color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  SENT:           { label: 'Enviada',        color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  RECEIVED:       { label: 'Recibida',       color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  CONFIRMED:      { label: 'Confirmada',     color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' },
  EXCEPTION:      { label: 'Excepción',      color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  NO_RESPONSE:    { label: 'Sin respuesta',  color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
  ALTERNATIVE:    { label: 'Alt. proc.',     color: '#374151', bg: '#f3f4f6', border: '#d1d5db' },
  SUBMITTED:      { label: 'Enviado',        color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  ACCEPTED:       { label: 'Aceptado',       color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0' },
  REJECTED:       { label: 'Rechazado',      color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
};

const SEVERITY_PRINT: Record<string, { label: string; color: string; bg: string }> = {
  CRITICAL: { label: 'Crítico',     color: '#991b1b', bg: '#fee2e2' },
  HIGH:     { label: 'Alto',        color: '#c2410c', bg: '#ffedd5' },
  MEDIUM:   { label: 'Medio',       color: '#92400e', bg: '#fef3c7' },
  LOW:      { label: 'Bajo',        color: '#1e40af', bg: '#dbeafe' },
  INFO:     { label: 'Informativo', color: '#374151', bg: '#f3f4f6' },
};

const PHASE_HEADER_COLOR: Record<string, string> = {
  PLANNING:  '#1e40af',
  FIELDWORK: '#92400e',
  REPORTING: '#5b21b6',
  FOLLOWUP:  '#065f46',
};

// ─── Helper: dates ───────────────────────────────────────────────────────────

function fmt(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return '—'; }
}
function fmtShort(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  catch { return '—'; }
}
function nowFull() {
  return new Date().toLocaleDateString('es', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
function flattenFolders(f: AuditFolder): AuditFolder[] {
  return [f, ...f.children.flatMap(flattenFolders)];
}

// ─── Reusable print-safe sub-components ──────────────────────────────────────

function Badge({ status }: { status: string }) {
  const s = STATUS_PRINT[status] ?? STATUS_PRINT.DRAFT;
  return (
    <span style={{
      display: 'inline-block', fontSize: 9, fontWeight: 600,
      padding: '1px 7px', borderRadius: 12,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

function SevBadge({ sev }: { sev: string }) {
  const s = SEVERITY_PRINT[sev] ?? SEVERITY_PRINT.INFO;
  return (
    <span style={{
      display: 'inline-block', fontSize: 9, fontWeight: 700,
      padding: '1px 7px', borderRadius: 12,
      color: s.color, background: s.bg, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

function SectionTitle({ n, label, color = C.navy }: { n: string; label: string; color?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 14px', marginBottom: 12,
      background: `${color}0d`,
      borderLeft: `4px solid ${color}`,
      borderRadius: '0 8px 8px 0',
      pageBreakBefore: 'always',
    }}>
      <span style={{
        fontSize: 10, fontWeight: 800, color: '#fff',
        background: color, padding: '2px 8px', borderRadius: 6,
        fontFamily: 'monospace',
      }}>{n}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color }}>{label}</span>
    </div>
  );
}

function SignCell({ name, date }: { name?: string | null; date?: string | null }) {
  if (!name) return <span style={{ color: C.grayLight, fontSize: 9 }}>—</span>;
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 600, color: C.green }}>{name}</div>
      <div style={{ fontSize: 8, color: C.grayMid }}>{fmtShort(date)}</div>
    </div>
  );
}

// ─── Folder tree ─────────────────────────────────────────────────────────────

function FolderTree({ folders, paperMap, depth = 0 }: {
  folders: AuditFolder[];
  paperMap: Map<string, WorkingPaper>;
  depth?: number;
}) {
  return (
    <div>
      {folders.map(folder => (
        <div key={folder.id} style={{
          marginLeft: depth * 18,
          marginBottom: 10,
          borderLeft: depth > 0 ? `2px solid ${C.border}` : undefined,
          paddingLeft: depth > 0 ? 12 : 0,
        }}>
          {/* Folder row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 10px',
            background: depth === 0 ? '#f0f4f8' : '#f9fafb',
            border: `1px solid ${depth === 0 ? '#cbd5e1' : C.border}`,
            borderRadius: 6, marginBottom: 4,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
              color: C.gray, background: '#e5e7eb',
              padding: '1px 6px', borderRadius: 4, flexShrink: 0,
            }}>{folder.ref}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#1f2937', flex: 1 }}>
              📁 {folder.name}
            </span>
            {folder.description && (
              <span style={{ fontSize: 9, color: C.grayLight, fontStyle: 'italic' }}>
                {folder.description}
              </span>
            )}
            <span style={{ fontSize: 9, color: C.grayMid, flexShrink: 0 }}>
              {folder.papers.length} papel(es){folder.children.length > 0 ? ` · ${folder.children.length} sub-carpeta(s)` : ''}
            </span>
          </div>

          {/* Papers table */}
          {folder.papers.length > 0 && (
            <div style={{ marginLeft: 14, marginBottom: 4 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
                <thead>
                  <tr>
                    <th style={TH} align="left">Ref.</th>
                    <th style={TH} align="left">Papel de Trabajo</th>
                    <th style={TH} align="left">Tipo</th>
                    <th style={TH} align="center">Estado</th>
                    <th style={TH} align="left">Preparado por</th>
                    <th style={TH} align="left">Revisado por</th>
                    <th style={TH} align="center">V.</th>
                    <th style={TH} align="center">H.</th>
                    <th style={TH} align="center">💬</th>
                  </tr>
                </thead>
                <tbody>
                  {folder.papers.map((stub, i) => {
                    const wp  = paperMap.get(stub.id);
                    const tag = getTag(stub);
                    const isFile = stub.wpKind === 'FILE';
                    return (
                      <tr key={stub.id} style={{ background: i % 2 === 1 ? '#f9fafb' : '#fff' }}>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                          <span style={{
                            fontFamily: 'monospace', fontWeight: 700, fontSize: 9,
                            color: C.blue, background: '#eff6ff',
                            padding: '1px 5px', borderRadius: 3,
                          }}>{stub.ref ?? stub.code}</span>
                        </td>
                        <td style={{ ...TD, maxWidth: 190 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                            <span style={{ fontSize: 9, flexShrink: 0 }}>
                              {stub.wpKind === 'SMART' ? '🧠' : stub.wpKind === 'MASTER' ? '⭐' :
                               stub.wpKind === 'LIVE'  ? '📊' : stub.wpKind === 'FILE'   ? '📎' : '📄'}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 500, color: '#111827', lineHeight: 1.3 }}>
                              {stub.title}
                            </span>
                          </div>
                          {isFile && stub.originalFilename && (
                            <div style={{ fontSize: 8, color: C.grayLight, marginLeft: 16, marginTop: 1 }}>
                              {stub.originalFilename}
                            </div>
                          )}
                          {(wp as any)?.carryForward && (
                            <span style={{ fontSize: 8, color: '#7c3aed', background: '#f5f3ff', padding: '0 4px', borderRadius: 3, marginLeft: 16 }}>
                              ↩ CF
                            </span>
                          )}
                        </td>
                        <td style={TD}>
                          {isFile
                            ? <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 4, color: tag.color, background: tag.bg }}>{tag.label}</span>
                            : <span style={{ fontSize: 9, color: C.grayMid }}>{WP_TYPE_LABEL[stub.type] ?? stub.type}</span>}
                        </td>
                        <td style={{ ...TD, textAlign: 'center' }}><Badge status={stub.status} /></td>
                        <td style={{ ...TD, fontSize: 9, color: C.gray }}>{stub.preparedBy?.name ?? wp?.preparedBy?.name ?? '—'}</td>
                        <td style={{ ...TD, fontSize: 9, color: C.gray }}>{stub.reviewedBy?.name ?? wp?.reviewedBy?.name ?? '—'}</td>
                        <td style={{ ...TD, textAlign: 'center', fontSize: 9, color: C.grayMid }}>v{wp?.version ?? 1}</td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          {(stub._count?.findings ?? 0) > 0
                            ? <span style={{ fontSize: 9, fontWeight: 700, color: '#b45309', background: '#fffbeb', padding: '1px 5px', borderRadius: 10 }}>{stub._count?.findings}</span>
                            : <span style={{ fontSize: 9, color: '#d1d5db' }}>—</span>}
                        </td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          {(stub._count?.comments ?? 0) > 0
                            ? <span style={{ fontSize: 9, fontWeight: 700, color: C.indigo, background: '#eef2ff', padding: '1px 5px', borderRadius: 10 }}>{stub._count?.comments}</span>
                            : <span style={{ fontSize: 9, color: '#d1d5db' }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Notes to reviewer */}
              {folder.papers.map(stub => {
                const wp = paperMap.get(stub.id);
                if (!wp?.notesToReviewer) return null;
                return (
                  <div key={`n-${stub.id}`} style={{
                    display: 'flex', gap: 6, padding: '4px 8px',
                    background: '#fffbeb', border: '1px solid #fde68a',
                    borderRadius: 4, marginBottom: 3,
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#92400e', flexShrink: 0 }}>
                      📝 ({stub.ref ?? stub.code}):
                    </span>
                    <span style={{ fontSize: 9, color: '#78350f' }}>{wp.notesToReviewer}</span>
                  </div>
                );
              })}
            </div>
          )}

          {folder.children.length > 0 && (
            <FolderTree folders={folder.children} paperMap={paperMap} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { auditId: string; onClose: () => void; }

export function WorkingPaperIndexReport({ auditId, onClose }: Props) {
  const { data: audit }         = useAudit(auditId);
  const { data: phases }        = useExpediente(auditId);
  const { data: papers }        = useWorkingPapersForAudit(auditId);
  const { data: signOff }       = useSignOffMatrix(auditId);
  const { data: findings }      = useFindingsByAudit(auditId);
  const { data: timeEntries }   = useAuditTimeEntries(auditId);
  const { data: pbcItems }      = usePbcRequestsForAudit(auditId);
  const { data: confirmations } = useConfirmationsForAudit(auditId);

  const paperMap = new Map<string, WorkingPaper>((papers ?? []).map(p => [p.id, p]));
  const isLoading = !audit || !phases || !papers;

  // KPIs
  const totalPapers   = papers?.length ?? 0;
  const signedOff     = papers?.filter(p => p.status === 'SIGNED_OFF' || p.status === 'CLOSED').length ?? 0;
  const totalFindings = findings?.length ?? 0;
  const openNotes     = papers?.reduce((s, p) => s + (p.comments ?? []).filter(c => !c.resolved).length, 0) ?? 0;
  const totalHours    = timeEntries?.reduce((s, e) => s + Number(e.hours), 0) ?? 0;

  // ── New-window print approach ──────────────────────────────────────────────
  function handlePrint() {
    const reportEl = document.getElementById('wp-report-content');
    if (!reportEl) return;

    const win = window.open('', '_blank', 'width=1100,height=900,scrollbars=yes,resizable=yes');
    if (!win) {
      alert('Permite ventanas emergentes para generar el PDF.\nConfig: Configuración → Privacidad → Ventanas emergentes → Permitir.');
      return;
    }

    win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Índice de Papeles — ${audit?.title ?? ''}</title>
  <style>
    @page { size: A4; margin: 12mm 10mm 12mm 10mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Segoe UI", Arial, sans-serif; background: white; font-size: 11px; }
    @media screen { body { background: #f1f5f9; padding: 24px; } #report-wrap { max-width: 900px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,.1); overflow: hidden; } }
    @media print { body { padding: 0; } }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: 4px 8px; }
  </style>
</head>
<body>
  <div id="report-wrap">${reportEl.innerHTML}</div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 600);
    };
  </script>
</body>
</html>`);
    win.document.close();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#f0f4f8', display: 'flex',
      flexDirection: 'column', height: '100vh', overflow: 'hidden',
    }}>
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={{
        background: '#0f172a', color: '#f8fafc',
        padding: '12px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 16, flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FileText style={{ width: 20, height: 20, color: '#60a5fa' }} />
          <div>
            <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>Reporte Completo de Auditoría</p>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
              {audit?.title ?? '…'} · {audit?.code ?? ''}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handlePrint} disabled={isLoading} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 20px', background: isLoading ? '#475569' : '#2563eb',
            color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 600, fontSize: 13,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}>
            <Printer style={{ width: 16, height: 16 }} />
            {isLoading ? 'Cargando datos…' : 'Generar PDF'}
          </button>
          <button onClick={onClose} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '8px 14px', background: 'transparent',
            color: '#94a3b8', border: '1px solid #334155',
            borderRadius: 8, fontWeight: 500, fontSize: 13, cursor: 'pointer',
          }}>
            <X style={{ width: 16, height: 16 }} /> Cerrar
          </button>
        </div>
      </div>

      {/* ── Preview ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: '#64748b' }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              border: '3px solid #bfdbfe', borderTopColor: '#2563eb',
              animation: 'spin 1s linear infinite',
            }} />
            <p style={{ margin: 0, fontSize: 14 }}>Cargando datos del expediente…</p>
          </div>
        ) : (
          <div style={{ maxWidth: 900, margin: '0 auto', background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,.08)', overflow: 'hidden', fontFamily: '"Segoe UI", Arial, sans-serif' }}>

            {/* ═══════════════════════════════════════════════════════════
                REPORT CONTENT — everything inside this div is printed
            ═══════════════════════════════════════════════════════════ */}
            <div id="wp-report-content">

              {/* ── PORTADA ───────────────────────────────────────────── */}
              <div style={{ background: 'linear-gradient(135deg,#0f2d4a 0%,#1e4a7a 60%,#1d4ed8 100%)', color: '#fff', padding: '40px 48px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 18 }}>📋</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#93c5fd', letterSpacing: '0.08em' }}>AUDITMIND — Intelligence Platform</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: 10, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Generado el</p>
                    <p style={{ margin: 0, fontSize: 11, color: '#bfdbfe' }}>{nowFull()}</p>
                  </div>
                </div>

                <div style={{ marginBottom: 28 }}>
                  <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#93c5fd' }}>
                    REPORTE COMPLETO DE AUDITORÍA
                  </p>
                  <h1 style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                    Expediente y Papeles
                  </h1>
                  <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 400, color: '#bfdbfe' }}>de Trabajo</h2>
                  <div style={{ height: 2, background: 'linear-gradient(90deg,#60a5fa,transparent)', borderRadius: 2, width: 180, marginBottom: 20 }} />
                  <h3 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>{audit!.title}</h3>
                  <p style={{ margin: 0, fontSize: 12, color: '#bfdbfe' }}>
                    {audit!.auditEntity?.name ?? audit!.auditableUnit?.name ?? '—'}
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  {[
                    { label: 'Código',         value: audit!.code || '—' },
                    { label: 'Tipo',            value: audit!.type },
                    { label: 'Estado',          value: ({PLANNING:'Planificación',IN_PROGRESS:'En Progreso',REVIEW:'En Revisión',CLOSED:'Cerrada',CANCELLED:'Cancelada'} as Record<string,string>)[audit!.status] ?? audit!.status },
                    { label: 'Período inicio',  value: fmt(audit!.startDate) },
                    { label: 'Período fin',     value: fmt(audit!.endDate) },
                    { label: 'Nivel de riesgo', value: audit!.riskLevel ?? '—' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: 'rgba(255,255,255,.08)', borderRadius: 8, padding: '8px 12px' }}>
                      <p style={{ margin: '0 0 2px', fontSize: 9, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── KPI bar ──────────────────────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', borderBottom: '2px solid #e2e8f0' }}>
                {[
                  { label: 'Papeles',    value: totalPapers,   color: C.blue,   bg: '#eff6ff' },
                  { label: 'Firmados',   value: signedOff,     color: C.green,  bg: '#f0fdf4' },
                  { label: 'Hallazgos',  value: totalFindings, color: '#b45309', bg: '#fffbeb' },
                  { label: 'Horas reg.', value: totalHours.toFixed(1), color: C.violet, bg: '#f5f3ff' },
                  { label: 'Notas abiertas', value: openNotes, color: C.indigo, bg: '#eef2ff' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} style={{ padding: '14px 20px', background: bg, textAlign: 'center', borderRight: '1px solid #e2e8f0' }}>
                    <p style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 800, color }}>{value}</p>
                    <p style={{ margin: 0, fontSize: 9, color: '#64748b', fontWeight: 500 }}>{label}</p>
                  </div>
                ))}
              </div>

              {/* ─────────────────────────────────────────────────────── */}
              {/* SECCIÓN 1 — RESUMEN                                     */}
              {/* ─────────────────────────────────────────────────────── */}
              <div style={{ padding: '20px 32px' }}>
                <SectionTitle n="1" label="Resumen de la Auditoría" color={C.navy} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 14 }}>
                  {/* Datos generales */}
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: '#f8fafc', padding: '6px 12px', borderBottom: `1px solid ${C.border}` }}>
                      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: C.navy }}>Datos Generales</p>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
                      <tbody>
                        {[
                          ['Código', audit!.code || '—'],
                          ['Tipo', audit!.type],
                          ['Estado', audit!.status],
                          ['Período', `${fmt(audit!.startDate)} — ${fmt(audit!.endDate)}`],
                          ['Nivel de riesgo', audit!.riskLevel ?? '—'],
                          ['Materialidad', audit!.materiality ? `$${audit!.materiality.toLocaleString()}` : '—'],
                          ['Hs. Estimadas', audit!.estimatedHours ? `${audit!.estimatedHours} h` : '—'],
                          ['Hs. Reales', audit!.actualHours ? `${audit!.actualHours} h` : '—'],
                        ].map(([k, v]) => (
                          <tr key={k}>
                            <td style={{ padding: '4px 10px', fontSize: 9, fontWeight: 600, color: C.grayMid, borderBottom: `1px solid #f3f4f6`, width: '40%' }}>{k}</td>
                            <td style={{ padding: '4px 10px', fontSize: 9, color: C.gray, borderBottom: `1px solid #f3f4f6` }}>{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Alcance y objetivos */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {audit!.scope && (
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ background: '#f8fafc', padding: '6px 12px', borderBottom: `1px solid ${C.border}` }}>
                          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: C.navy }}>Alcance</p>
                        </div>
                        <p style={{ margin: 0, padding: '8px 12px', fontSize: 9, color: C.gray, lineHeight: 1.6 }}>{audit!.scope}</p>
                      </div>
                    )}
                    {audit!.objectives && (
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ background: '#f8fafc', padding: '6px 12px', borderBottom: `1px solid ${C.border}` }}>
                          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: C.navy }}>Objetivos</p>
                        </div>
                        <p style={{ margin: 0, padding: '8px 12px', fontSize: 9, color: C.gray, lineHeight: 1.6 }}>{audit!.objectives}</p>
                      </div>
                    )}
                    {/* Modelo de riesgo */}
                    {audit!.auditRiskModel && (
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ background: '#f8fafc', padding: '6px 12px', borderBottom: `1px solid ${C.border}` }}>
                          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: C.navy }}>Modelo de Riesgo de Auditoría</p>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', padding: '8px 12px', gap: 8 }}>
                          {[
                            { k: 'Inherente', v: `${audit!.auditRiskModel.inherentRisk}%` },
                            { k: 'Control', v: `${audit!.auditRiskModel.controlRisk}%` },
                            { k: 'Detección', v: `${audit!.auditRiskModel.detectionRisk}%` },
                            { k: 'Auditoría', v: `${audit!.auditRiskModel.auditRisk}%` },
                          ].map(({ k, v }) => (
                            <div key={k} style={{ textAlign: 'center' }}>
                              <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 800, color: C.blue }}>{v}</p>
                              <p style={{ margin: 0, fontSize: 8, color: C.grayMid }}>{k}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ─────────────────────────────────────────────────────── */}
              {/* SECCIÓN 2 — EQUIPO                                      */}
              {/* ─────────────────────────────────────────────────────── */}
              {(audit!.team ?? []).length > 0 && (
                <div style={{ padding: '0 32px 20px' }}>
                  <SectionTitle n="2" label="Equipo Asignado" color="#0369a1" />
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
                    <thead>
                      <tr>
                        <th style={TH} align="left">#</th>
                        <th style={TH} align="left">Nombre</th>
                        <th style={TH} align="left">Rol en la Auditoría</th>
                        <th style={TH} align="left">Rol Sistema</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(audit!.team ?? []).map((m, i) => (
                        <tr key={m.id} style={{ background: i % 2 === 1 ? '#f9fafb' : '#fff' }}>
                          <td style={{ ...TD, color: C.grayMid, width: 30 }}>{i + 1}</td>
                          <td style={{ ...TD, fontWeight: 600, color: '#111827' }}>{m.user.name}</td>
                          <td style={TD}>{m.role}</td>
                          <td style={TD}>
                            <span style={{
                              fontSize: 8, fontWeight: 600, padding: '1px 7px', borderRadius: 10,
                              color: '#1e40af', background: '#dbeafe',
                            }}>{m.user.role}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────── */}
              {/* SECCIÓN 3 — EXPEDIENTE                                  */}
              {/* ─────────────────────────────────────────────────────── */}
              <div style={{ padding: '0 32px 20px' }}>
                <SectionTitle n="3" label="Expediente — Árbol de Papeles de Trabajo" color={C.navy} />
                {(phases ?? []).filter(p => p.folders.length > 0).map(phase => {
                  const headerColor = PHASE_HEADER_COLOR[phase.phaseType] ?? C.navy;
                  const phaseLabel  = PHASE_CONFIG[phase.phaseType]?.label ?? phase.phaseType;
                  const allStubs    = phase.folders.flatMap(flattenFolders).flatMap(f => f.papers);
                  const phaseSigned = allStubs.filter(s => s.status === 'SIGNED_OFF' || s.status === 'CLOSED').length;
                  return (
                    <div key={phase.id} style={{ marginBottom: 24 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 16px', background: headerColor,
                        borderRadius: '8px 8px 0 0', color: '#fff',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 12, fontWeight: 800 }}>{phaseLabel.toUpperCase()}</span>
                          <span style={{ fontSize: 9, background: 'rgba(255,255,255,.15)', padding: '2px 8px', borderRadius: 10 }}>
                            {phase.name}
                          </span>
                        </div>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,.8)' }}>
                          {phase.startDate ? `${fmt(phase.startDate)} – ${fmt(phase.targetDate)} · ` : ''}
                          ✍ {phaseSigned}/{allStubs.length} firmados
                          {phase.signedOffAt ? ` · ✅ Fase cerrada ${fmtShort(phase.signedOffAt)}` : ''}
                        </span>
                      </div>
                      <div style={{ border: `1px solid #e2e8f0`, borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 16, background: '#fff' }}>
                        <FolderTree folders={phase.folders} paperMap={paperMap} depth={0} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ─────────────────────────────────────────────────────── */}
              {/* SECCIÓN 4 — HALLAZGOS                                   */}
              {/* ─────────────────────────────────────────────────────── */}
              {(findings ?? []).length > 0 && (
                <div style={{ padding: '0 32px 20px' }}>
                  <SectionTitle n="4" label="Hallazgos de Auditoría" color="#b45309" />
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
                    <thead>
                      <tr>
                        <th style={TH} align="left">#</th>
                        <th style={TH} align="left">Hallazgo</th>
                        <th style={TH} align="center">Severidad</th>
                        <th style={TH} align="center">Estado</th>
                        <th style={TH} align="left">Responsable</th>
                        <th style={TH} align="center">Vence</th>
                        <th style={TH} align="center">Q.</th>
                        <th style={TH} align="center">$</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(findings ?? []).map((f, i) => (
                        <tr key={f.id} style={{ background: i % 2 === 1 ? '#f9fafb' : '#fff' }}>
                          <td style={{ ...TD, color: C.grayMid, width: 24 }}>{i + 1}</td>
                          <td style={{ ...TD, maxWidth: 220 }}>
                            <div style={{ fontWeight: 600, color: '#111827', fontSize: 10, lineHeight: 1.3 }}>{f.title}</div>
                            {f.condition && <div style={{ fontSize: 8, color: C.grayMid, marginTop: 2 }}>{f.condition.substring(0, 100)}{f.condition.length > 100 ? '…' : ''}</div>}
                          </td>
                          <td style={{ ...TD, textAlign: 'center' }}><SevBadge sev={f.severity} /></td>
                          <td style={{ ...TD, textAlign: 'center' }}><Badge status={f.status} /></td>
                          <td style={{ ...TD, fontSize: 9, color: C.gray }}>{(f as any).responsible?.name ?? '—'}</td>
                          <td style={{ ...TD, textAlign: 'center', fontSize: 9, color: f.dueDate && new Date(f.dueDate) < new Date() ? '#dc2626' : C.grayMid }}>
                            {fmtShort(f.dueDate)}
                          </td>
                          <td style={{ ...TD, textAlign: 'center' }}>
                            {f.qualityScore != null
                              ? <span style={{ fontSize: 9, fontWeight: 700, color: f.qualityScore >= 80 ? C.green : f.qualityScore >= 60 ? '#d97706' : '#dc2626' }}>{f.qualityScore}</span>
                              : <span style={{ color: '#d1d5db', fontSize: 9 }}>—</span>}
                          </td>
                          <td style={{ ...TD, textAlign: 'center', fontSize: 9, color: f.isMaterial ? '#b45309' : C.grayLight, fontWeight: f.isMaterial ? 700 : 400 }}>
                            {f.effectAmount ? `$${Number(f.effectAmount).toLocaleString()}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────── */}
              {/* SECCIÓN 5 — HORAS                                       */}
              {/* ─────────────────────────────────────────────────────── */}
              {(timeEntries ?? []).length > 0 && (
                <div style={{ padding: '0 32px 20px' }}>
                  <SectionTitle n="5" label="Horas Registradas" color={C.violet} />
                  <div style={{ marginBottom: 10, display: 'flex', gap: 16 }}>
                    {[
                      { label: 'Horas registradas', value: `${totalHours.toFixed(1)} h` },
                      { label: 'Horas estimadas',   value: `${audit!.estimatedHours ?? '—'} h` },
                      { label: 'Variación',          value: audit!.estimatedHours ? `${(((totalHours / audit!.estimatedHours) - 1) * 100).toFixed(1)}%` : '—' },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '8px 16px', textAlign: 'center', minWidth: 100 }}>
                        <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 800, color: C.violet }}>{value}</p>
                        <p style={{ margin: 0, fontSize: 9, color: '#6d28d9' }}>{label}</p>
                      </div>
                    ))}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
                    <thead>
                      <tr>
                        <th style={TH} align="left">Fecha</th>
                        <th style={TH} align="left">Auditor</th>
                        <th style={TH} align="center">Horas</th>
                        <th style={TH} align="left">Descripción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(timeEntries ?? []).map((e, i) => (
                        <tr key={e.id} style={{ background: i % 2 === 1 ? '#f9fafb' : '#fff' }}>
                          <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtShort(e.workDate)}</td>
                          <td style={{ ...TD, fontSize: 9, color: C.gray }}>{(e as any).user?.name ?? '—'}</td>
                          <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: C.violet }}>{Number(e.hours).toFixed(1)}</td>
                          <td style={{ ...TD, color: C.grayMid }}>{e.description ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────── */}
              {/* SECCIÓN 6 — PBC                                         */}
              {/* ─────────────────────────────────────────────────────── */}
              {(pbcItems ?? []).length > 0 && (
                <div style={{ padding: '0 32px 20px' }}>
                  <SectionTitle n="6" label="Portal de Clientes (PBC)" color="#0369a1" />
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
                    <thead>
                      <tr>
                        <th style={TH} align="left">#</th>
                        <th style={TH} align="left">Solicitud</th>
                        <th style={TH} align="left">Solicitado a</th>
                        <th style={TH} align="center">Estado</th>
                        <th style={TH} align="center">Vence</th>
                        <th style={TH} align="center">Enviado</th>
                        <th style={TH} align="center">Arch.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pbcItems ?? []).map((p, i) => (
                        <tr key={p.id} style={{ background: i % 2 === 1 ? '#f9fafb' : '#fff' }}>
                          <td style={{ ...TD, color: C.grayMid, width: 24 }}>{i + 1}</td>
                          <td style={{ ...TD, maxWidth: 200 }}>
                            <div style={{ fontWeight: 600, color: '#111827' }}>{p.title}</div>
                            {p.description && <div style={{ fontSize: 8, color: C.grayLight, marginTop: 1 }}>{p.description.substring(0, 80)}{p.description.length > 80 ? '…' : ''}</div>}
                          </td>
                          <td style={{ ...TD, fontSize: 9 }}>
                            <div style={{ color: C.gray }}>{p.requestedToName ?? '—'}</div>
                            <div style={{ color: C.grayLight, fontSize: 8 }}>{p.requestedToEmail}</div>
                          </td>
                          <td style={{ ...TD, textAlign: 'center' }}><Badge status={p.status} /></td>
                          <td style={{ ...TD, textAlign: 'center', fontSize: 9, color: p.dueDate && new Date(p.dueDate) < new Date() && p.status === 'PENDING' ? '#dc2626' : C.grayMid }}>
                            {fmtShort(p.dueDate)}
                          </td>
                          <td style={{ ...TD, textAlign: 'center', fontSize: 9, color: C.grayMid }}>{fmtShort(p.submittedAt)}</td>
                          <td style={{ ...TD, textAlign: 'center', fontSize: 9, color: C.grayMid }}>
                            {(p.fileUrls?.length ?? 0) > 0 ? (
                              <span style={{ fontWeight: 700, color: C.green }}>{p.fileUrls.length}</span>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────── */}
              {/* SECCIÓN 7 — CONFIRMACIONES                              */}
              {/* ─────────────────────────────────────────────────────── */}
              {(confirmations ?? []).length > 0 && (
                <div style={{ padding: '0 32px 20px' }}>
                  <SectionTitle n="7" label="Confirmaciones Externas (NIA 505)" color="#065f46" />
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
                    <thead>
                      <tr>
                        <th style={TH} align="left">#</th>
                        <th style={TH} align="left">Respondente</th>
                        <th style={TH} align="left">Tipo</th>
                        <th style={TH} align="center">Estado</th>
                        <th style={TH} align="right">Monto</th>
                        <th style={TH} align="right">Resp. Monto</th>
                        <th style={TH} align="right">Diferencia</th>
                        <th style={TH} align="center">Enviada</th>
                        <th style={TH} align="center">Recibida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(confirmations ?? []).map((c, i) => {
                        const diff = c.responseAmount != null && c.amount != null ? c.responseAmount - c.amount : null;
                        return (
                          <tr key={c.id} style={{ background: i % 2 === 1 ? '#f9fafb' : '#fff' }}>
                            <td style={{ ...TD, color: C.grayMid, width: 24 }}>{i + 1}</td>
                            <td style={{ ...TD, maxWidth: 160 }}>
                              <div style={{ fontWeight: 600, color: '#111827' }}>{c.respondentName}</div>
                              <div style={{ fontSize: 8, color: C.grayLight }}>{c.respondentEmail}</div>
                            </td>
                            <td style={{ ...TD, fontSize: 9, color: C.grayMid }}>{c.type}</td>
                            <td style={{ ...TD, textAlign: 'center' }}><Badge status={c.status} /></td>
                            <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 9 }}>
                              {c.amount != null ? `$${Number(c.amount).toLocaleString()}` : '—'}
                            </td>
                            <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 9 }}>
                              {c.responseAmount != null ? `$${Number(c.responseAmount).toLocaleString()}` : '—'}
                            </td>
                            <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontSize: 9, fontWeight: diff != null && diff !== 0 ? 700 : 400, color: diff != null && diff !== 0 ? '#dc2626' : C.grayMid }}>
                              {diff != null ? `$${Math.abs(diff).toLocaleString()}` : '—'}
                            </td>
                            <td style={{ ...TD, textAlign: 'center', fontSize: 9, color: C.grayMid }}>{fmtShort(c.sentAt)}</td>
                            <td style={{ ...TD, textAlign: 'center', fontSize: 9, color: C.grayMid }}>{fmtShort(c.responseReceivedAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────── */}
              {/* APÉNDICE A — MATRIZ DE FIRMAS                           */}
              {/* ─────────────────────────────────────────────────────── */}
              {(signOff ?? []).length > 0 && (
                <div style={{ padding: '0 32px 20px' }}>
                  <SectionTitle n="A" label="Matriz de Firmas" color={C.green} />
                  {(() => {
                    const grouped: Record<string, SignOffMatrixRow[]> = {};
                    (signOff ?? []).forEach(r => {
                      const sec = r.indexSection || 'Sin sección';
                      if (!grouped[sec]) grouped[sec] = [];
                      grouped[sec].push(r);
                    });
                    return (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
                        <thead>
                          <tr style={{ background: '#f0fdf4' }}>
                            <th style={{ ...TH, width: 70 }} align="left">Ref.</th>
                            <th style={TH} align="left">Papel de Trabajo</th>
                            <th style={{ ...TH, width: 80 }} align="center">Estado</th>
                            <th style={{ ...TH, width: 100 }} align="left">Preparado por</th>
                            <th style={{ ...TH, width: 100 }} align="left">Revisado por</th>
                            <th style={{ ...TH, width: 100 }} align="left">Firmado (CAE)</th>
                            <th style={{ ...TH, width: 30 }} align="center">Q.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(grouped).map(([section, rows]) => (
                            <>
                              <tr key={`sec-${section}`}>
                                <td colSpan={7} style={{
                                  padding: '5px 8px', background: '#f0fdf4',
                                  fontSize: 9, fontWeight: 700, color: C.green,
                                  borderTop: '1px solid #a7f3d0', borderBottom: '1px solid #a7f3d0',
                                }}>Sección {section}</td>
                              </tr>
                              {rows.map((row, idx) => (
                                <tr key={row.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                  <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 700, fontSize: 9, color: C.blue }}>{row.code}</td>
                                  <td style={{ ...TD, maxWidth: 200, fontSize: 10 }}>{row.title}</td>
                                  <td style={{ ...TD, textAlign: 'center' }}><Badge status={row.status} /></td>
                                  <td style={TD}><SignCell name={row.preparedBy?.name} date={row.preparedAt} /></td>
                                  <td style={TD}><SignCell name={row.reviewedBy?.name} date={row.reviewedAt} /></td>
                                  <td style={TD}><SignCell name={row.signedOffBy?.name} date={row.signedOffAt} /></td>
                                  <td style={{ ...TD, textAlign: 'center' }}>
                                    {row.qualityScore != null
                                      ? <span style={{ fontSize: 9, fontWeight: 700, color: row.qualityScore >= 80 ? C.green : row.qualityScore >= 60 ? '#d97706' : '#dc2626' }}>{row.qualityScore}</span>
                                      : <span style={{ color: '#d1d5db' }}>—</span>}
                                  </td>
                                </tr>
                              ))}
                            </>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              )}

              {/* ─────────────────────────────────────────────────────── */}
              {/* APÉNDICE B — NOTAS DE REVISIÓN ABIERTAS                 */}
              {/* ─────────────────────────────────────────────────────── */}
              {(() => {
                const withOpen = (papers ?? []).filter(p => (p.comments ?? []).some(c => !c.resolved));
                if (withOpen.length === 0) return null;
                return (
                  <div style={{ padding: '0 32px 20px' }}>
                    <SectionTitle n="B" label="Notas de Revisión Abiertas" color={C.indigo} />
                    {withOpen.map(wp => {
                      const open = (wp.comments ?? []).filter(c => !c.resolved);
                      return (
                        <div key={wp.id} style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 9, color: C.blue, background: '#eff6ff', padding: '1px 5px', borderRadius: 3 }}>
                              {wp.ref ?? wp.paperCode ?? wp.code}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#1f2937' }}>{wp.title}</span>
                            <span style={{ fontSize: 8, color: C.indigo, background: '#eef2ff', padding: '1px 5px', borderRadius: 10, fontWeight: 600 }}>
                              {open.length} abierta(s)
                            </span>
                          </div>
                          <div style={{ marginLeft: 16 }}>
                            {open.map(c => (
                              <div key={c.id} style={{ display: 'flex', gap: 8, padding: '4px 8px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 4, marginBottom: 3 }}>
                                <span style={{ fontSize: 9, color: C.grayMid, flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtShort(c.createdAt)}</span>
                                <span style={{ fontSize: 9, color: '#3730a3', flex: 1 }}>{c.content}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* ── Footer ───────────────────────────────────────────── */}
              <div style={{
                margin: '8px 32px 24px',
                paddingTop: 14,
                borderTop: '2px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: C.navy }}>AuditMind — Reporte Completo de Auditoría</p>
                  <p style={{ margin: 0, fontSize: 9, color: '#94a3b8' }}>
                    {audit!.title} · {audit!.code} · {nowFull()}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>CONFIDENCIAL — Uso interno del equipo auditor</p>
                  <p style={{ margin: 0, fontSize: 9, color: '#94a3b8' }}>
                    {totalPapers} papeles · {(phases ?? []).length} fases · {totalFindings} hallazgos
                  </p>
                </div>
              </div>

            </div>{/* end #wp-report-content */}
          </div>
        )}
      </div>
    </div>
  );
}
