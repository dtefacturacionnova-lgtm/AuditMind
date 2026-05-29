'use client';

/**
 * WorkingPaperIndexReport
 * ──────────────────────────────────────────────────────────────────────────────
 * Genera un índice profesional de papeles de trabajo imprimible (A4).
 * Se abre como modal de pantalla completa con un botón "Imprimir PDF".
 *
 * Datos que consume:
 *   - useAudit              → metadatos de la auditoría
 *   - useExpediente         → árbol fases / carpetas / WpStub
 *   - useWorkingPapersForAudit → papeles completos (comentarios, hallazgos, notas)
 *   - useSignOffMatrix      → matriz de firmas de todos los papeles
 */

import { useRef } from 'react';
import { X, Printer, FileText } from 'lucide-react';
import { useAudit } from '@/hooks/useAudits';
import { useExpediente, PHASE_CONFIG, PHASE_STATUS_CONFIG, type AuditFolder, type WpStub } from '@/hooks/useExpediente';
import { useWorkingPapersForAudit, type WorkingPaper } from '@/hooks/useWorkingPapers';
import { useSignOffMatrix, type SignOffMatrixRow } from '@/hooks/useWorkingPaperSignOff';

// ─── File-type helpers (same logic as ExpedienteTab) ─────────────────────────

const EXT_MAP: { ext: string; label: string; color: string; bg: string }[] = [
  { ext: '.xlsx', label: 'XLS', color: '#166534', bg: '#dcfce7' },
  { ext: '.xls',  label: 'XLS', color: '#166534', bg: '#dcfce7' },
  { ext: '.docx', label: 'DOC', color: '#1e40af', bg: '#dbeafe' },
  { ext: '.doc',  label: 'DOC', color: '#1e40af', bg: '#dbeafe' },
  { ext: '.pptx', label: 'PPT', color: '#c2410c', bg: '#ffedd5' },
  { ext: '.ppt',  label: 'PPT', color: '#c2410c', bg: '#ffedd5' },
  { ext: '.pdf',  label: 'PDF', color: '#991b1b', bg: '#fee2e2' },
  { ext: '.mp3',  label: 'AUD', color: '#6b21a8', bg: '#f3e8ff' },
  { ext: '.wav',  label: 'AUD', color: '#6b21a8', bg: '#f3e8ff' },
  { ext: '.mp4',  label: 'VID', color: '#0369a1', bg: '#e0f2fe' },
  { ext: '.png',  label: 'IMG', color: '#be185d', bg: '#fce7f3' },
  { ext: '.jpg',  label: 'IMG', color: '#be185d', bg: '#fce7f3' },
  { ext: '.jpeg', label: 'IMG', color: '#be185d', bg: '#fce7f3' },
];
const MIME_MAP: { test: (m: string) => boolean; label: string; color: string; bg: string }[] = [
  { test: (m) => m.includes('spreadsheet') || m.includes('excel'), label: 'XLS', color: '#166534', bg: '#dcfce7' },
  { test: (m) => m.includes('presentation') || m.includes('powerpoint'), label: 'PPT', color: '#c2410c', bg: '#ffedd5' },
  { test: (m) => m.startsWith('audio/'), label: 'AUD', color: '#6b21a8', bg: '#f3e8ff' },
  { test: (m) => m.startsWith('video/'), label: 'VID', color: '#0369a1', bg: '#e0f2fe' },
  { test: (m) => m.startsWith('image/'), label: 'IMG', color: '#be185d', bg: '#fce7f3' },
  { test: (m) => m === 'application/pdf', label: 'PDF', color: '#991b1b', bg: '#fee2e2' },
  { test: (m) => m.includes('word') || m.includes('document'), label: 'DOC', color: '#1e40af', bg: '#dbeafe' },
];

function getFileTag(stub: WpStub): { label: string; color: string; bg: string } {
  if (stub.mimeType) {
    const found = MIME_MAP.find(({ test }) => test(stub.mimeType!));
    if (found) return found;
  }
  if (stub.originalFilename) {
    const lower = stub.originalFilename.toLowerCase();
    const ext   = EXT_MAP.find(({ ext }) => lower.endsWith(ext));
    if (ext) return ext;
  }
  return { label: 'PT', color: '#374151', bg: '#f3f4f6' };
}

// ─── WP type labels ───────────────────────────────────────────────────────────

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

// ─── Status pill ─────────────────────────────────────────────────────────────

const WP_STATUS_PRINT: Record<string, { label: string; color: string; bg: string; border: string }> = {
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
};

const PHASE_COLORS: Record<string, { header: string; border: string }> = {
  PLANNING:  { header: '#1e40af', border: '#93c5fd' },
  FIELDWORK: { header: '#92400e', border: '#fcd34d' },
  REPORTING: { header: '#5b21b6', border: '#c4b5fd' },
  FOLLOWUP:  { header: '#065f46', border: '#6ee7b7' },
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

function fmt(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

function fmtShort(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch { return '—'; }
}

function now() {
  return new Date().toLocaleDateString('es', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Sub-components (print-safe, no Tailwind) ─────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = WP_STATUS_PRINT[status] ?? WP_STATUS_PRINT.DRAFT;
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 9,
      fontWeight: 600,
      padding: '1px 6px',
      borderRadius: 10,
      color: cfg.color,
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

function FileTypeBadge({ stub }: { stub: WpStub }) {
  const tag = getFileTag(stub);
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 8,
      fontWeight: 700,
      padding: '1px 5px',
      borderRadius: 4,
      color: tag.color,
      background: tag.bg,
      letterSpacing: '0.05em',
    }}>
      {tag.label}
    </span>
  );
}

function SignCell({ name, date }: { name?: string | null; date?: string | null }) {
  if (!name) {
    return (
      <span style={{ color: '#9ca3af', fontSize: 9 }}>—</span>
    );
  }
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 9, fontWeight: 600, color: '#065f46' }}>{name}</span>
      <span style={{ fontSize: 8, color: '#6b7280' }}>{fmtShort(date)}</span>
    </span>
  );
}

// ─── Recursive folder tree ────────────────────────────────────────────────────

function FolderTree({
  folders,
  paperMap,
  depth = 0,
}: {
  folders: AuditFolder[];
  paperMap: Map<string, WorkingPaper>;
  depth?: number;
}) {
  return (
    <div>
      {folders.map((folder) => (
        <div
          key={folder.id}
          style={{
            marginLeft: depth * 16,
            marginBottom: 10,
            borderLeft: depth > 0 ? '2px solid #e5e7eb' : undefined,
            paddingLeft: depth > 0 ? 12 : 0,
          }}
        >
          {/* Folder header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            background: depth === 0 ? '#f8fafc' : '#fafafa',
            border: `1px solid ${depth === 0 ? '#cbd5e1' : '#e5e7eb'}`,
            borderRadius: 6,
            marginBottom: 4,
          }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: '#374151',
              background: '#e5e7eb',
              padding: '1px 5px',
              borderRadius: 4,
              flexShrink: 0,
            }}>
              {folder.ref}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#1f2937', flex: 1 }}>
              📁 {folder.name}
            </span>
            {folder.description && (
              <span style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic' }}>
                {folder.description}
              </span>
            )}
            <span style={{ fontSize: 9, color: '#6b7280', flexShrink: 0 }}>
              {folder.papers.length} papel(es)
              {folder.children.length > 0 && ` · ${folder.children.length} sub-carpeta(s)`}
            </span>
          </div>

          {/* Papers in this folder */}
          {folder.papers.length > 0 && (
            <div style={{ marginLeft: 16, marginBottom: 4 }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 9,
                marginBottom: 4,
              }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={TH} align="left">Ref.</th>
                    <th style={TH} align="left">Papel de Trabajo</th>
                    <th style={TH} align="left">Tipo</th>
                    <th style={TH} align="center">Estado</th>
                    <th style={TH} align="center">Tipo Doc.</th>
                    <th style={TH} align="left">Preparado por</th>
                    <th style={TH} align="left">Revisado por</th>
                    <th style={TH} align="center">V.</th>
                    <th style={TH} align="center">H.</th>
                    <th style={TH} align="center">Com.</th>
                  </tr>
                </thead>
                <tbody>
                  {folder.papers.map((stub, idx) => {
                    const wp = paperMap.get(stub.id);
                    return (
                      <PaperRow key={stub.id} stub={stub} wp={wp} odd={idx % 2 === 1} />
                    );
                  })}
                </tbody>
              </table>

              {/* Notes to reviewer for papers that have them */}
              {folder.papers.map((stub) => {
                const wp = paperMap.get(stub.id);
                if (!wp?.notesToReviewer) return null;
                return (
                  <div
                    key={`note-${stub.id}`}
                    style={{
                      display: 'flex',
                      gap: 6,
                      padding: '4px 8px',
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: 4,
                      marginBottom: 3,
                    }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#92400e', flexShrink: 0 }}>
                      📝 Nota ({stub.ref ?? stub.code}):
                    </span>
                    <span style={{ fontSize: 9, color: '#78350f' }}>{wp.notesToReviewer}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sub-folders (recursive) */}
          {folder.children.length > 0 && (
            <FolderTree folders={folder.children} paperMap={paperMap} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  );
}

const TH: React.CSSProperties = {
  padding: '3px 6px',
  fontSize: 8,
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = {
  padding: '4px 6px',
  borderBottom: '1px solid #f3f4f6',
  verticalAlign: 'top',
};

function PaperRow({ stub, wp, odd }: { stub: WpStub; wp?: WorkingPaper; odd: boolean }) {
  const isFile   = stub.wpKind === 'FILE';
  const comments = wp?._count?.comments ?? stub._count?.comments ?? 0;
  const findings = wp?._count?.findings ?? stub._count?.findings ?? 0;
  const version  = wp?.version ?? 1;

  return (
    <tr style={{ background: odd ? '#f9fafb' : '#ffffff' }}>
      {/* Ref */}
      <td style={{ ...TD, whiteSpace: 'nowrap' }}>
        <span style={{
          fontFamily: 'monospace',
          fontWeight: 700,
          fontSize: 9,
          color: '#1d4ed8',
          background: '#eff6ff',
          padding: '1px 4px',
          borderRadius: 3,
        }}>
          {stub.ref ?? stub.code}
        </span>
      </td>

      {/* Title */}
      <td style={{ ...TD, maxWidth: 180 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
          {/* Kind icon */}
          <span style={{ fontSize: 9, flexShrink: 0, marginTop: 1 }}>
            {stub.wpKind === 'SMART'  ? '🧠' :
             stub.wpKind === 'MASTER' ? '⭐' :
             stub.wpKind === 'LIVE'   ? '📊' :
             stub.wpKind === 'FILE'   ? '📎' : '📄'}
          </span>
          <span style={{ fontSize: 10, fontWeight: 500, color: '#111827', lineHeight: 1.3 }}>
            {stub.title}
          </span>
        </div>
        {stub.wpKind === 'FILE' && stub.originalFilename && (
          <span style={{ fontSize: 8, color: '#9ca3af', display: 'block', marginTop: 1, marginLeft: 16 }}>
            {stub.originalFilename}
          </span>
        )}
        {(wp as any)?.carryForward && (
          <span style={{
            fontSize: 8, color: '#6b21a8', background: '#f5f3ff',
            padding: '0 4px', borderRadius: 3, marginLeft: 16, display: 'inline-block',
          }}>
            ↩ CF
          </span>
        )}
      </td>

      {/* Type */}
      <td style={{ ...TD, whiteSpace: 'nowrap' }}>
        {isFile ? (
          <FileTypeBadge stub={stub} />
        ) : (
          <span style={{ fontSize: 9, color: '#6b7280' }}>
            {WP_TYPE_LABEL[stub.type] ?? stub.type}
          </span>
        )}
      </td>

      {/* Status */}
      <td style={{ ...TD, textAlign: 'center' }}>
        <StatusBadge status={stub.status} />
      </td>

      {/* Doc type badge */}
      <td style={{ ...TD, textAlign: 'center' }}>
        {isFile ? (
          <FileTypeBadge stub={stub} />
        ) : (
          <span style={{
            fontSize: 8, color: '#6b7280',
            background: stub.wpKind === 'SMART' ? '#f5f3ff' :
                        stub.wpKind === 'MASTER'? '#fef9c3' :
                        '#f3f4f6',
            padding: '1px 5px', borderRadius: 4,
          }}>
            {stub.wpKind === 'SMART' ? 'Inteligente' :
             stub.wpKind === 'MASTER'? 'Master' :
             stub.wpKind === 'LIVE'  ? 'Vivo' : 'Estándar'}
          </span>
        )}
      </td>

      {/* Prepared by */}
      <td style={TD}>
        <span style={{ fontSize: 9, color: '#374151' }}>
          {stub.preparedBy?.name ?? wp?.preparedBy?.name ?? '—'}
        </span>
      </td>

      {/* Reviewed by */}
      <td style={TD}>
        <span style={{ fontSize: 9, color: '#374151' }}>
          {stub.reviewedBy?.name ?? wp?.reviewedBy?.name ?? '—'}
        </span>
      </td>

      {/* Version */}
      <td style={{ ...TD, textAlign: 'center' }}>
        <span style={{ fontSize: 9, color: '#6b7280' }}>v{version}</span>
      </td>

      {/* Findings */}
      <td style={{ ...TD, textAlign: 'center' }}>
        {findings > 0 ? (
          <span style={{
            fontSize: 9, fontWeight: 700,
            color: '#b45309', background: '#fffbeb',
            padding: '1px 5px', borderRadius: 10,
          }}>
            {findings}
          </span>
        ) : (
          <span style={{ fontSize: 9, color: '#d1d5db' }}>—</span>
        )}
      </td>

      {/* Comments */}
      <td style={{ ...TD, textAlign: 'center' }}>
        {comments > 0 ? (
          <span style={{
            fontSize: 9, fontWeight: 700,
            color: '#4f46e5', background: '#eef2ff',
            padding: '1px 5px', borderRadius: 10,
          }}>
            {comments}
          </span>
        ) : (
          <span style={{ fontSize: 9, color: '#d1d5db' }}>—</span>
        )}
      </td>
    </tr>
  );
}

// ─── Open comments section ────────────────────────────────────────────────────

function OpenCommentsSection({ papers }: { papers: WorkingPaper[] }) {
  const withComments = papers.filter(
    (p) => (p.comments ?? []).some((c) => !c.resolved)
  );
  if (withComments.length === 0) return null;

  return (
    <div style={{ marginTop: 24, pageBreakBefore: 'auto' }}>
      <SectionHeader label="Notas de Revisión Abiertas" emoji="💬" color="#4f46e5" />
      {withComments.map((wp) => {
        const open = (wp.comments ?? []).filter((c) => !c.resolved);
        return (
          <div key={wp.id} style={{ marginBottom: 12 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
            }}>
              <span style={{
                fontFamily: 'monospace', fontWeight: 700, fontSize: 9,
                color: '#1d4ed8', background: '#eff6ff',
                padding: '1px 5px', borderRadius: 3,
              }}>
                {wp.ref ?? wp.paperCode ?? wp.code}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#1f2937' }}>{wp.title}</span>
              <span style={{
                fontSize: 8, color: '#4f46e5', background: '#eef2ff',
                padding: '1px 5px', borderRadius: 10, fontWeight: 600,
              }}>
                {open.length} abierta(s)
              </span>
            </div>
            <div style={{ marginLeft: 16 }}>
              {open.map((c) => (
                <div key={c.id} style={{
                  display: 'flex', gap: 8, padding: '4px 8px',
                  background: '#eef2ff', border: '1px solid #c7d2fe',
                  borderRadius: 4, marginBottom: 3,
                }}>
                  <span style={{ fontSize: 9, color: '#6b7280', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {fmtShort(c.createdAt)}
                  </span>
                  <span style={{ fontSize: 9, color: '#3730a3', flex: 1 }}>{c.content}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sign-off matrix section ──────────────────────────────────────────────────

function SignOffMatrixSection({ rows }: { rows: SignOffMatrixRow[] }) {
  if (rows.length === 0) return null;

  const grouped: Record<string, SignOffMatrixRow[]> = {};
  rows.forEach((r) => {
    const sec = r.indexSection || 'Sin sección';
    if (!grouped[sec]) grouped[sec] = [];
    grouped[sec].push(r);
  });

  return (
    <div style={{ marginTop: 24, pageBreakBefore: 'always' }}>
      <SectionHeader label="Matriz de Firmas" emoji="✍" color="#065f46" />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
        <thead>
          <tr style={{ background: '#f0fdf4' }}>
            <th style={{ ...TH, width: 60 }} align="left">Ref.</th>
            <th style={TH} align="left">Papel de Trabajo</th>
            <th style={{ ...TH, width: 80 }} align="center">Estado</th>
            <th style={{ ...TH, width: 90 }} align="left">Preparado por</th>
            <th style={{ ...TH, width: 90 }} align="left">Revisado por</th>
            <th style={{ ...TH, width: 90 }} align="left">Firmado (CAE)</th>
            <th style={{ ...TH, width: 30 }} align="center">Q.</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(grouped).map(([section, sRows]) => (
            <>
              <tr key={`sec-${section}`}>
                <td colSpan={7} style={{
                  padding: '5px 6px',
                  background: '#f0fdf4',
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#065f46',
                  borderTop: '1px solid #a7f3d0',
                  borderBottom: '1px solid #a7f3d0',
                }}>
                  Sección {section}
                </td>
              </tr>
              {sRows.map((row, idx) => (
                <tr key={row.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                  <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 700, fontSize: 9, color: '#1d4ed8' }}>
                    {row.code}
                  </td>
                  <td style={{ ...TD, maxWidth: 200, fontSize: 10 }}>{row.title}</td>
                  <td style={{ ...TD, textAlign: 'center' }}>
                    <StatusBadge status={row.status} />
                  </td>
                  <td style={TD}><SignCell name={row.preparedBy?.name} date={row.preparedAt} /></td>
                  <td style={TD}><SignCell name={row.reviewedBy?.name} date={row.reviewedAt} /></td>
                  <td style={TD}><SignCell name={row.signedOffBy?.name} date={row.signedOffAt} /></td>
                  <td style={{ ...TD, textAlign: 'center' }}>
                    {row.qualityScore != null ? (
                      <span style={{
                        fontSize: 9, fontWeight: 700,
                        color: row.qualityScore >= 80 ? '#065f46' : row.qualityScore >= 60 ? '#d97706' : '#dc2626',
                      }}>
                        {row.qualityScore}
                      </span>
                    ) : (
                      <span style={{ color: '#d1d5db', fontSize: 9 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section header helper ────────────────────────────────────────────────────

function SectionHeader({ label, emoji, color }: { label: string; emoji: string; color: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 12px',
      background: color + '10',
      border: `1px solid ${color}30`,
      borderLeft: `4px solid ${color}`,
      borderRadius: '0 6px 6px 0',
      marginBottom: 10,
    }}>
      <span style={{ fontSize: 14 }}>{emoji}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color, letterSpacing: '-0.01em' }}>
        {label}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  auditId: string;
  onClose: () => void;
}

export function WorkingPaperIndexReport({ auditId, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  const { data: audit }    = useAudit(auditId);
  const { data: phases }   = useExpediente(auditId);
  const { data: papers }   = useWorkingPapersForAudit(auditId);
  const { data: signOff }  = useSignOffMatrix(auditId);

  const paperMap = new Map<string, WorkingPaper>(
    (papers ?? []).map((p) => [p.id, p])
  );

  const isLoading = !audit || !phases || !papers;

  function handlePrint() {
    window.print();
  }

  // ── KPI summary ──────────────────────────────────────────────────────────
  const totalPapers = papers?.length ?? 0;
  const signedOff   = papers?.filter(p => p.status === 'SIGNED_OFF' || p.status === 'CLOSED').length ?? 0;
  const withFindings = papers?.filter(p => (p._count?.findings ?? 0) > 0).length ?? 0;
  const openComments = papers?.reduce((s, p) => s + (p.comments ?? []).filter(c => !c.resolved).length, 0) ?? 0;

  return (
    <>
      {/* ── Print CSS injected via style tag ──────────────────────────────── */}
      <style>{`
        @media print {
          body > *:not(#wp-index-print-root) { display: none !important; }
          #wp-index-print-root { position: static !important; }
          .no-print { display: none !important; }
          @page {
            size: A4;
            margin: 15mm 12mm 15mm 12mm;
          }
          .print-page-break { page-break-before: always; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @media screen {
          #wp-index-print-root { position: fixed; inset: 0; z-index: 9999; }
        }
      `}</style>

      {/* ── Overlay wrapper ───────────────────────────────────────────────── */}
      <div
        id="wp-index-print-root"
        style={{
          background: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        {/* Toolbar (no-print) */}
        <div
          className="no-print"
          style={{
            background: '#0f172a',
            color: '#f8fafc',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FileText style={{ width: 20, height: 20, color: '#60a5fa' }} />
            <div>
              <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>
                Índice de Papeles de Trabajo
              </p>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                {audit?.title ?? '…'} · {audit?.code ?? ''}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handlePrint}
              disabled={isLoading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 18px',
                background: isLoading ? '#475569' : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                cursor: isLoading ? 'not-allowed' : 'pointer',
              }}
            >
              <Printer style={{ width: 16, height: 16 }} />
              {isLoading ? 'Cargando…' : 'Imprimir / Guardar PDF'}
            </button>
            <button
              onClick={onClose}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '8px 14px',
                background: 'transparent',
                color: '#94a3b8',
                border: '1px solid #334155',
                borderRadius: 8,
                fontWeight: 500,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <X style={{ width: 16, height: 16 }} />
              Cerrar
            </button>
          </div>
        </div>

        {/* Scrollable report area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          {isLoading ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: 300, gap: 12, color: '#64748b',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                border: '3px solid #bfdbfe', borderTopColor: '#2563eb',
                animation: 'spin 1s linear infinite',
              }} />
              <p style={{ margin: 0, fontSize: 14 }}>Cargando datos del expediente…</p>
            </div>
          ) : (
            <div
              ref={printRef}
              style={{
                maxWidth: 900,
                margin: '0 auto',
                background: '#fff',
                borderRadius: 12,
                boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                overflow: 'hidden',
                fontFamily: '"Inter", "Segoe UI", sans-serif',
              }}
            >
              {/* ════════════════════════════════════════════════════════════
                  COVER PAGE
              ═══════════════════════════════════════════════════════════════ */}
              <div style={{
                background: 'linear-gradient(135deg, #0f2d4a 0%, #1e4a7a 60%, #1d4ed8 100%)',
                color: '#fff',
                padding: '40px 48px 32px',
              }}>
                {/* Header brand strip */}
                <div style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', marginBottom: 32,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: 'rgba(255,255,255,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <FileText style={{ width: 20, height: 20, color: '#93c5fd' }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#93c5fd', letterSpacing: '0.08em' }}>
                      AUDITMIND
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: 10, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Generado el
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: '#bfdbfe' }}>{now()}</p>
                  </div>
                </div>

                {/* Report title */}
                <div style={{ marginBottom: 28 }}>
                  <p style={{
                    margin: '0 0 6px',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                    color: '#93c5fd',
                  }}>
                    INFORME OFICIAL DE AUDITORÍA
                  </p>
                  <h1 style={{
                    margin: '0 0 4px',
                    fontSize: 28,
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.15,
                  }}>
                    Índice de Papeles
                  </h1>
                  <h2 style={{
                    margin: '0 0 16px',
                    fontSize: 18,
                    fontWeight: 400,
                    color: '#bfdbfe',
                    lineHeight: 1.3,
                  }}>
                    de Trabajo
                  </h2>

                  <div style={{
                    height: 2,
                    background: 'linear-gradient(90deg, #60a5fa, transparent)',
                    borderRadius: 2,
                    width: 180,
                    marginBottom: 20,
                  }} />

                  <h3 style={{
                    margin: '0 0 4px',
                    fontSize: 20,
                    fontWeight: 700,
                    color: '#fff',
                  }}>
                    {audit!.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, color: '#bfdbfe' }}>
                    {audit!.auditEntity?.name ?? audit!.auditableUnit?.name ?? '—'}
                  </p>
                </div>

                {/* Metadata grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 12,
                }}>
                  {[
                    { label: 'Código', value: audit!.code },
                    { label: 'Tipo', value: audit!.type },
                    { label: 'Estado', value: ({
                      PLANNING: 'Planificación', IN_PROGRESS: 'En Progreso',
                      REVIEW: 'En Revisión', CLOSED: 'Cerrada', CANCELLED: 'Cancelada',
                    } as Record<string, string>)[audit!.status] ?? audit!.status },
                    { label: 'Período inicio', value: fmt(audit!.startDate) },
                    { label: 'Período fin', value: fmt(audit!.endDate) },
                    { label: 'Nivel de riesgo', value: audit!.riskLevel ?? '—' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      backdropFilter: 'blur(8px)',
                    }}>
                      <p style={{ margin: '0 0 2px', fontSize: 9, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {label}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#fff' }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── KPI summary bar ── */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                borderBottom: '2px solid #e2e8f0',
              }}>
                {[
                  { label: 'Papeles de Trabajo', value: totalPapers, color: '#1d4ed8', bg: '#eff6ff' },
                  { label: 'Firmados / Cerrados', value: signedOff,  color: '#065f46', bg: '#f0fdf4' },
                  { label: 'Con Hallazgos',       value: withFindings, color: '#b45309', bg: '#fffbeb' },
                  { label: 'Notas Abiertas',       value: openComments, color: '#4f46e5', bg: '#eef2ff' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} style={{
                    padding: '16px 24px',
                    background: bg,
                    textAlign: 'center',
                    borderRight: '1px solid #e2e8f0',
                  }}>
                    <p style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color }}>{value}</p>
                    <p style={{ margin: 0, fontSize: 10, color: '#64748b', fontWeight: 500 }}>{label}</p>
                  </div>
                ))}
              </div>

              {/* ── Scope + objectives ── */}
              {(audit!.scope || audit!.objectives) && (
                <div style={{ padding: '20px 32px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: audit!.scope && audit!.objectives ? '1fr 1fr' : '1fr', gap: 20 }}>
                    {audit!.scope && (
                      <div>
                        <p style={{ margin: '0 0 4px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' }}>
                          Alcance
                        </p>
                        <p style={{ margin: 0, fontSize: 10, color: '#374151', lineHeight: 1.6 }}>
                          {audit!.scope}
                        </p>
                      </div>
                    )}
                    {audit!.objectives && (
                      <div>
                        <p style={{ margin: '0 0 4px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' }}>
                          Objetivos
                        </p>
                        <p style={{ margin: 0, fontSize: 10, color: '#374151', lineHeight: 1.6 }}>
                          {audit!.objectives}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════════════════════════════
                  EXPEDIENTE — Phases + Folders + Papers
              ═══════════════════════════════════════════════════════════════ */}
              <div style={{ padding: '24px 32px' }}>

                {(phases ?? []).map((phase) => {
                  const phaseCfg = PHASE_CONFIG[phase.phaseType];
                  const phaseColors = PHASE_COLORS[phase.phaseType] ?? { header: '#374151', border: '#d1d5db' };
                  const allPapersInPhase = phase.folders.flatMap(flattenFolders).flatMap(f => f.papers);
                  const phaseSignedOff = allPapersInPhase.filter(s => s.status === 'SIGNED_OFF' || s.status === 'CLOSED').length;

                  if (phase.folders.length === 0) return null;

                  return (
                    <div key={phase.id} style={{ marginBottom: 28, pageBreakInside: 'avoid' }}>
                      {/* Phase header */}
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 16px',
                        background: phaseColors.header,
                        borderRadius: '8px 8px 0 0',
                        color: '#fff',
                        marginBottom: 0,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-0.01em' }}>
                            {phaseCfg.label.toUpperCase()}
                          </span>
                          <span style={{
                            fontSize: 9, fontWeight: 600,
                            background: 'rgba(255,255,255,0.15)',
                            padding: '2px 8px', borderRadius: 10,
                          }}>
                            {phase.name}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>
                          {phase.startDate && (
                            <span>📅 {fmt(phase.startDate)} – {fmt(phase.targetDate)}</span>
                          )}
                          <span>
                            ✍ {phaseSignedOff} / {allPapersInPhase.length} firmados
                          </span>
                          {phase.signedOffAt && (
                            <span style={{
                              background: 'rgba(255,255,255,0.2)',
                              padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                            }}>
                              ✅ Fase cerrada {fmtShort(phase.signedOffAt)}
                              {phase.signedOffBy && ` — ${phase.signedOffBy.name}`}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Folders */}
                      <div style={{
                        border: `1px solid ${phaseColors.border}`,
                        borderTop: 'none',
                        borderRadius: '0 0 8px 8px',
                        padding: 16,
                        background: '#fff',
                      }}>
                        <FolderTree folders={phase.folders} paperMap={paperMap} depth={0} />
                      </div>
                    </div>
                  );
                })}

                {/* Sign-off matrix */}
                <SignOffMatrixSection rows={signOff ?? []} />

                {/* Open review notes */}
                <OpenCommentsSection papers={papers ?? []} />

                {/* Footer */}
                <div style={{
                  marginTop: 32,
                  paddingTop: 16,
                  borderTop: '2px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#0f2d4a' }}>
                      AuditMind — Índice de Papeles de Trabajo
                    </p>
                    <p style={{ margin: 0, fontSize: 9, color: '#94a3b8' }}>
                      {audit!.title} · {audit!.code} · Generado el {now()}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: 9, color: '#94a3b8' }}>
                      CONFIDENCIAL — Solo para uso interno del equipo auditor
                    </p>
                    <p style={{ margin: 0, fontSize: 9, color: '#94a3b8' }}>
                      {totalPapers} papeles · {(phases ?? []).length} fases
                    </p>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Helper: flatten folder tree ─────────────────────────────────────────────

function flattenFolders(folder: AuditFolder): AuditFolder[] {
  return [folder, ...folder.children.flatMap(flattenFolders)];
}
