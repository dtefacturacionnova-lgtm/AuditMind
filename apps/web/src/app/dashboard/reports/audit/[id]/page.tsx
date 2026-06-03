'use client';

import { use, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuditReport, type ReportFinding } from '@/hooks/useReports';
import { formatDate } from '@/lib/utils';
import { Printer, ChevronDown, ChevronRight } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: 'Crítico', HIGH: 'Alto', MEDIUM: 'Medio', LOW: 'Bajo', INFORMATIONAL: 'Informativo',
};
const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#d97706', LOW: '#2563eb', INFORMATIONAL: '#6b7280',
};
const METHODOLOGY_LABELS: Record<string, string> = {
  RISK_BASED: 'Basada en Riesgos', COMPLIANCE: 'Cumplimiento', SUBSTANTIVE: 'Sustantiva',
  ANALYTICAL: 'Analítica', FORENSIC: 'Forense',
};
const WP_TYPE_LABELS: Record<string, string> = {
  PLANNING_UNDERSTANDING: 'A — Planificación',
  CONTROL_EVALUATION:     'B — Evaluación de Controles',
  SUBSTANTIVE_TEST:       'C — Pruebas Sustantivas',
  DATA_ANALYSIS:          'AD — Análisis de Datos',
  FINDING:                'D — Hallazgo',
  CLOSURE_CONCLUSION:     'E — Conclusión',
  INTERVIEW:              'I — Entrevista',
  CONFIRMATION:           'CF — Confirmación',
  NORMATIVE_ANALYSIS:     'N — Análisis Normativo',
};
const ACTION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente', IN_PROGRESS: 'En Curso', COMPLETED: 'Completada', OVERDUE: 'Vencida',
};
const OPINION_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; text: string }> = {
  SATISFACTORY:     { label: 'Satisfactorio',     color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', text: 'No se identificaron hallazgos significativos abiertos. La gestión de control interno opera de manera efectiva.' },
  NEEDS_IMPROVEMENT:{ label: 'Con Observaciones', color: '#d97706', bg: '#fffbeb', border: '#fde68a', text: 'Se identificaron oportunidades de mejora en procesos de control. Se requiere implementar las acciones correctivas recomendadas.' },
  UNSATISFACTORY:   { label: 'Insatisfactorio',   color: '#dc2626', bg: '#fef2f2', border: '#fecaca', text: 'Se identificaron deficiencias significativas de control que requieren atención prioritaria de la administración.' },
  CRITICAL:         { label: 'Crítico',            color: '#7f1d1d', bg: '#fef2f2', border: '#ef4444', text: 'Se identificaron deficiencias críticas de control que requieren acción inmediata. Se eleva al Comité de Auditoría.' },
  NOT_RATED:        { label: 'Sin Calificación',   color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', text: 'Trabajo de asesoría/investigación especial. No aplica calificación de opinión estándar.' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8 print:mb-6">
      <h2 className="text-sm font-bold text-[#0F2D4A] border-b-2 border-[#0F2D4A] pb-1 mb-4 uppercase tracking-wide">
        {title}
      </h2>
      {children}
    </div>
  );
}

function KpiBox({ label, value, color = '#1e293b' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="border border-gray-200 rounded-xl p-3 text-center">
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
      <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{label}</p>
    </div>
  );
}

function NiaField({ label, value, accent }: { label: string; value?: string; accent?: boolean }) {
  if (!value) return null;
  return (
    <div className={`space-y-1 ${accent ? 'pl-3 border-l-4 border-blue-400' : ''}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}

// ─── Finding Block ────────────────────────────────────────────────────────────

function FindingBlock({ finding, index, isPreliminary }: {
  finding: ReportFinding;
  index: number;
  isPreliminary: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const sevColor = SEVERITY_COLORS[finding.severity] ?? '#6b7280';
  const sevLabel = SEVERITY_LABELS[finding.severity] ?? finding.severity;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        style={{ borderLeft: `4px solid ${sevColor}` }}
      >
        <span className="text-xs font-bold px-2 py-0.5 rounded text-white shrink-0"
          style={{ backgroundColor: sevColor }}>
          {sevLabel}
        </span>
        <p className="flex-1 text-sm font-semibold text-gray-800 truncate">{finding.title}</p>
        <div className="flex items-center gap-2 shrink-0">
          {finding.isMaterial && (
            <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-full">MATERIAL</span>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{finding.status}</span>
          {collapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {!collapsed && (
        <div className="px-5 py-4 space-y-4 border-t border-gray-100">
          {/* C·C·C·E·R·R */}
          <NiaField label="A. Condición — Lo que encontramos" value={finding.condition} />
          <NiaField label="B. Criterio — Norma o política aplicable" value={finding.criteria} />
          <NiaField label="C. Causa — Por qué ocurre" value={finding.cause} />
          <NiaField label="D. Efecto — Consecuencia" value={finding.effect} />
          {finding.risk && <NiaField label="E. Riesgo — Impacto potencial" value={finding.risk} />}
          {finding.recommendation && (
            <NiaField label="F. Recomendación" value={finding.recommendation} accent />
          )}

          {/* Referencia normativa */}
          {finding.normativeReference && (
            <p className="text-xs text-gray-500">
              <span className="font-semibold">Referencia normativa:</span> {finding.normativeReference}
              {finding.normativeArticle && ` — ${finding.normativeArticle}`}
            </p>
          )}

          {/* Management response */}
          {finding.managementResponse ? (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-1">
                Respuesta de Gerencia
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">{finding.managementResponse}</p>
            </div>
          ) : isPreliminary && (
            <div className="p-3 border-2 border-dashed border-amber-300 rounded-lg bg-amber-50">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">
                Respuesta de Gerencia
              </p>
              <p className="text-xs text-amber-600 italic">Pendiente de recepción — Informe Preliminar</p>
            </div>
          )}

          {/* Actions table */}
          {finding.actions && finding.actions.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                Plan de Acción ({finding.actions.length} acción{finding.actions.length !== 1 ? 'es' : ''})
              </p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-1 text-left text-gray-500 font-semibold border border-gray-100">Acción</th>
                    <th className="px-2 py-1 text-left text-gray-500 font-semibold border border-gray-100 w-24">Estado</th>
                    <th className="px-2 py-1 text-right text-gray-500 font-semibold border border-gray-100 w-16">Avance</th>
                    <th className="px-2 py-1 text-left text-gray-500 font-semibold border border-gray-100 w-28">Fecha límite</th>
                  </tr>
                </thead>
                <tbody>
                  {finding.actions.map(a => (
                    <tr key={a.id} className="border-b border-gray-50">
                      <td className="px-2 py-1.5 text-gray-700 border border-gray-100">{a.description}</td>
                      <td className="px-2 py-1.5 border border-gray-100">
                        <span className={`font-medium ${
                          a.status === 'COMPLETED' ? 'text-emerald-600' :
                          a.status === 'OVERDUE' ? 'text-red-600' :
                          a.status === 'IN_PROGRESS' ? 'text-blue-600' : 'text-gray-500'
                        }`}>
                          {ACTION_STATUS_LABELS[a.status] ?? a.status}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right border border-gray-100">
                        <span className="font-semibold">{a.progressPct}%</span>
                      </td>
                      <td className="px-2 py-1.5 text-gray-500 border border-gray-100">
                        {a.completionDate
                          ? `Comp. ${new Date(a.completionDate).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}`
                          : new Date(a.dueDate).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer meta */}
          <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-100 text-xs text-gray-400">
            {finding.effectAmount != null && (
              <span>Monto: <span className="font-semibold text-gray-600">
                {finding.effectAmount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
              </span></span>
            )}
            {finding.dueDate && (
              <span>Vence: <span className={`font-semibold ${new Date(finding.dueDate) < new Date() && finding.status !== 'CLOSED' ? 'text-red-600' : 'text-gray-600'}`}>
                {formatDate(finding.dueDate)}
              </span></span>
            )}
            {finding.responsible && (
              <span>Responsable: <span className="font-semibold text-gray-600">{finding.responsible.name}</span></span>
            )}
            {finding.qualityScore != null && (
              <span>Score calidad: <span className="font-semibold text-gray-600">{finding.qualityScore}/100</span></span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Report Content (needs Suspense for useSearchParams) ─────────────────────

function ReportContent({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const isPreliminary = searchParams.get('mode') === 'preliminary';
  const { data: report, isLoading, error } = useAuditReport(id);

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-[#0F2D4A] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (error || !report) return (
    <div className="flex items-center justify-center min-h-screen text-gray-500">
      Error cargando el informe
    </div>
  );

  const { audit, summary, findings, workingPapers, pbcRequests, confirmations, overallOpinion } = report;
  const opinion = OPINION_CONFIG[overallOpinion] ?? OPINION_CONFIG['NOT_RATED'];

  const modeLink = (mode: string) =>
    `/dashboard/reports/audit/${id}?mode=${mode}`;

  return (
    <div className="min-h-screen bg-white">
      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="print:hidden sticky top-0 z-10 bg-[#0F2D4A] text-white px-6 py-3 flex items-center justify-between shadow gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{audit.title}</p>
          <p className="text-xs text-blue-300">
            {isPreliminary ? 'Borrador Preliminar' : 'Informe Final'} · {new Date(report.generatedAt).toLocaleString('es-CL')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border border-blue-400 text-xs font-semibold">
            <a href={modeLink('preliminary')}
              className={`px-3 py-1.5 transition-colors ${isPreliminary ? 'bg-amber-500 text-white' : 'bg-transparent text-blue-200 hover:bg-blue-800'}`}>
              Preliminar
            </a>
            <a href={modeLink('final')}
              className={`px-3 py-1.5 transition-colors ${!isPreliminary ? 'bg-emerald-600 text-white' : 'bg-transparent text-blue-200 hover:bg-blue-800'}`}>
              Final
            </a>
          </div>
          <button
            onClick={() => {
              import('@/lib/api-client').then(m =>
                m.apiClient.downloadFile(
                  `/reports/audit/${id}/pdf`,
                  `auditmind_informe_${id.slice(0, 8)}.pdf`,
                ).catch(e => alert((e as Error).message))
              );
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-white text-[#0F2D4A] rounded-xl text-xs font-semibold hover:bg-blue-50 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Descargar PDF
          </button>
        </div>
      </div>

      {/* ── Document ─────────────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-8 py-10 print:px-6 print:py-8 print:max-w-full">

        {/* Preliminary banner */}
        {isPreliminary && (
          <div className="mb-8 p-4 bg-amber-50 border-2 border-amber-400 rounded-xl text-center print:mb-6">
            <p className="text-sm font-bold text-amber-800 uppercase tracking-widest">
              BORRADOR — INFORME PRELIMINAR
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Documento de trabajo sujeto a comentarios y respuesta de la administración. No debe difundirse.
            </p>
          </div>
        )}

        {/* ── Portada ───────────────────────────────────────────────────────── */}
        <div className="mb-10 pb-8 border-b-4 border-[#0F2D4A]">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs font-bold uppercase text-gray-400 tracking-widest mb-1">
                {audit.organization.name} — Auditoría Interna
              </p>
              <h1 className="text-2xl font-bold text-[#0F2D4A] leading-tight">{audit.title}</h1>
              <p className="text-sm text-gray-500 mt-1">{audit.auditEntity.name} — {audit.auditEntity.category}</p>
            </div>
            <div className="text-right shrink-0 ml-8">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-[#0F2D4A] text-white uppercase">
                {audit.type}
              </span>
              {audit.methodology && (
                <p className="text-xs text-gray-400 mt-1">{METHODOLOGY_LABELS[audit.methodology] ?? audit.methodology}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Período examinado</p>
              <p className="font-medium text-gray-700">
                {audit.auditPeriodStart && audit.auditPeriodEnd
                  ? `${formatDate(audit.auditPeriodStart)} — ${formatDate(audit.auditPeriodEnd)}`
                  : audit.startDate ? `${formatDate(audit.startDate)} — ${formatDate(audit.endDate ?? '')}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Auditor responsable</p>
              <p className="font-medium text-gray-700">{audit.lead?.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Materialidad</p>
              <p className="font-medium text-gray-700">
                {audit.materiality != null
                  ? audit.materiality.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Fecha emisión</p>
              <p className="font-medium text-gray-700">
                {audit.reportIssuanceDate ? formatDate(audit.reportIssuanceDate) : isPreliminary ? 'Borrador' : new Date().toLocaleDateString('es-CL')}
              </p>
            </div>
          </div>
        </div>

        {/* ── Opinión de Auditoría ──────────────────────────────────────────── */}
        <Section title="Opinión de Auditoría">
          <div className="rounded-xl p-5 flex items-start gap-5"
            style={{ backgroundColor: opinion.bg, border: `2px solid ${opinion.border}` }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0"
              style={{ backgroundColor: opinion.color }}>
              {overallOpinion === 'SATISFACTORY' ? '✓' :
               overallOpinion === 'NOT_RATED' ? '—' :
               overallOpinion === 'CRITICAL' || overallOpinion === 'UNSATISFACTORY' ? '✗' : '!'}
            </div>
            <div>
              <p className="text-base font-bold" style={{ color: opinion.color }}>{opinion.label}</p>
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">{opinion.text}</p>
              {audit.overallConclusion && (
                <p className="text-sm text-gray-700 mt-2 pt-2 border-t border-gray-200 italic leading-relaxed">
                  "{audit.overallConclusion}"
                </p>
              )}
            </div>
          </div>
        </Section>

        {/* ── Resumen Ejecutivo ─────────────────────────────────────────────── */}
        <Section title="Resumen Ejecutivo">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <KpiBox label="Hallazgos totales"  value={summary.findings.total} />
            <KpiBox label="Críticos / Altos"   value={(summary.findings.bySeverity['CRITICAL'] ?? 0) + (summary.findings.bySeverity['HIGH'] ?? 0)} color="#dc2626" />
            <KpiBox label="Cerrados"           value={summary.findings.closed} color="#16a34a" />
            <KpiBox label="Materiales"         value={summary.findings.material} color="#7c3aed" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiBox label="Horas planificadas" value={audit.estimatedHours} />
            <KpiBox label="Horas ejecutadas"   value={audit.actualHours}
              color={Math.abs(audit.hoursVariancePct) > 20 ? '#dc2626' : '#16a34a'} />
            <KpiBox label="Varianza"
              value={`${audit.hoursVariancePct > 0 ? '+' : ''}${audit.hoursVariancePct}%`}
              color={Math.abs(audit.hoursVariancePct) > 20 ? '#dc2626' : '#16a34a'} />
            <KpiBox label="Papeles aprobados"  value={summary.workingPapers.approved} color="#2563eb" />
          </div>
        </Section>

        {/* ── Objetivos y Alcance ──────────────────────────────────────────── */}
        {(audit.objectives || audit.scope) && (
          <Section title="Objetivos y Alcance">
            {audit.objectives && (
              <div className="mb-3">
                <p className="text-xs font-bold text-gray-500 uppercase mb-1">Objetivos</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{audit.objectives}</p>
              </div>
            )}
            {audit.scope && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase mb-1">Alcance</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{audit.scope}</p>
              </div>
            )}
          </Section>
        )}

        {/* ── Equipo ───────────────────────────────────────────────────────── */}
        <Section title="Equipo de Auditoría">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-3 py-2 text-xs font-semibold text-gray-600">Nombre</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-600">Rol en equipo</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-600">Email</th>
              </tr>
            </thead>
            <tbody>
              {audit.team.map((m, i) => (
                <tr key={m.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-3 py-2 font-medium text-gray-800 border-t border-gray-100">{m.name}</td>
                  <td className="px-3 py-2 text-gray-600 border-t border-gray-100">{m.teamRole}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs border-t border-gray-100">{m.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* ── Hallazgos ────────────────────────────────────────────────────── */}
        <Section title={`Hallazgos (${summary.findings.total})`}>
          <div className="flex flex-wrap gap-2 mb-5">
            {Object.entries(summary.findings.bySeverity).map(([sev, count]) => (
              <span key={sev}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: SEVERITY_COLORS[sev] ?? '#6b7280' }}>
                {SEVERITY_LABELS[sev] ?? sev}: {count}
              </span>
            ))}
          </div>
          {!findings.length ? (
            <p className="text-sm text-gray-400">Sin hallazgos registrados</p>
          ) : (
            <div>
              {findings.map((f, idx) => (
                <FindingBlock key={f.id} finding={f} index={idx + 1} isPreliminary={isPreliminary} />
              ))}
            </div>
          )}
        </Section>

        {/* ── Papeles de Trabajo ───────────────────────────────────────────── */}
        <Section title={`Índice de Papeles de Trabajo (${workingPapers.length})`}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-3 py-2 text-xs font-semibold text-gray-600 w-20">Índice</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-600">Título</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-600 w-36">Tipo</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-600 w-24">Estado</th>
              </tr>
            </thead>
            <tbody>
              {workingPapers.map((wp, i) => (
                <tr key={wp.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500 border-t border-gray-100">
                    {wp.indexSection ? `${wp.indexSection}-${wp.code}` : wp.code}
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-800 border-t border-gray-100">{wp.title}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 border-t border-gray-100">{WP_TYPE_LABELS[wp.type] ?? wp.type}</td>
                  <td className="px-3 py-2 text-xs border-t border-gray-100">
                    <span className={`font-semibold ${wp.status === 'APPROVED' ? 'text-emerald-600' : wp.status === 'IN_REVIEW' ? 'text-amber-600' : 'text-gray-500'}`}>
                      {wp.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* ── PBC ──────────────────────────────────────────────────────────── */}
        {pbcRequests.length > 0 && (
          <Section title={`Solicitudes PBC (${pbcRequests.length})`}>
            <div className="flex gap-4 mb-3 text-sm">
              <span className="text-emerald-600 font-medium">{summary.pbc.accepted} aceptadas</span>
              <span className="text-amber-600 font-medium">{summary.pbc.pending} pendientes</span>
            </div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-left">Solicitud</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-left">Auditado</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-left w-24">Estado</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-left w-28">Vence</th>
                </tr>
              </thead>
              <tbody>
                {pbcRequests.map((p: any, i: number) => (
                  <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-3 py-2 font-medium text-gray-800 border-t border-gray-100">{p.title}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs border-t border-gray-100">{p.requestedToName}</td>
                    <td className="px-3 py-2 text-xs text-gray-600 border-t border-gray-100">{p.status}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 border-t border-gray-100">{p.dueDate ? formatDate(p.dueDate) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* ── Confirmaciones Externas ──────────────────────────────────────── */}
        {confirmations.length > 0 && (
          <Section title={`Confirmaciones Externas NIA 505 (${confirmations.length})`}>
            <div className="flex gap-4 mb-3 text-sm">
              <span className="text-emerald-600 font-medium">{summary.confirmations.reconciled} conciliadas</span>
              <span className="text-amber-600 font-medium">{summary.confirmations.pending} pendientes</span>
            </div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-left w-24">Tipo</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-left">Respondente</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-right w-28">Monto libros</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-right w-28">Respuesta</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-right w-24">Diferencia</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-left w-24">Estado</th>
                </tr>
              </thead>
              <tbody>
                {confirmations.map((c: any, i: number) => (
                  <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-3 py-2 text-xs text-gray-600 border-t border-gray-100">{c.type}</td>
                    <td className="px-3 py-2 text-gray-800 font-medium border-t border-gray-100">{c.respondentName}</td>
                    <td className="px-3 py-2 text-xs text-right text-gray-600 border-t border-gray-100">
                      {c.amount != null ? c.amount.toLocaleString('es-CL') : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-right text-gray-600 border-t border-gray-100">
                      {c.responseAmount != null ? c.responseAmount.toLocaleString('es-CL') : '—'}
                    </td>
                    <td className={`px-3 py-2 text-xs text-right font-medium border-t border-gray-100 ${
                      c.difference != null && c.difference !== 0 ? 'text-red-600' : 'text-emerald-600'
                    }`}>
                      {c.difference != null ? c.difference.toLocaleString('es-CL') : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 border-t border-gray-100">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* ── Conclusión y Firmas ───────────────────────────────────────────── */}
        <Section title={isPreliminary ? 'Estado del Informe' : 'Firmas y Aprobación'}>
          {isPreliminary ? (
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <p className="text-sm font-semibold text-amber-800">Este es un informe preliminar</p>
              <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                <li>Los hallazgos están sujetos a revisión con la administración</li>
                <li>La administración tiene plazo para enviar respuesta y plan de acción</li>
                <li>El informe final se emitirá tras recibir las respuestas</li>
              </ul>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="border-t-2 border-gray-400 pt-3">
                  <p className="text-xs text-gray-500">Preparado por</p>
                  <p className="text-sm font-medium text-gray-700 mt-1">{audit.lead?.name ?? '—'}</p>
                  <p className="text-xs text-gray-400">Auditor Responsable</p>
                </div>
                <div className="border-t-2 border-dashed border-gray-300 pt-3">
                  <p className="text-xs text-gray-400 italic">Pendiente revisión por Gerente de Auditoría</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-gray-600">
                El presente informe ha sido preparado de conformidad con las Normas Internacionales para el Ejercicio
                Profesional de la Auditoría Interna (NIEPAI) y los estándares del Marco Internacional de Prácticas Profesionales del IIA.
              </p>
              <div className="grid grid-cols-3 gap-8 mt-6">
                {[
                  { role: 'Auditor Responsable', name: audit.lead?.name ?? '—' },
                  { role: 'Gerente de Auditoría', name: '' },
                  { role: 'CAE / Director de Auditoría', name: '' },
                ].map(({ role, name }) => (
                  <div key={role} className="space-y-8">
                    <div className="h-10 border-b-2 border-gray-800" />
                    <div>
                      <p className="text-xs font-semibold text-gray-700">{name || <span className="text-gray-300">_________________________</span>}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{role}</p>
                      <p className="text-xs text-gray-400 mt-3">Fecha: _______________</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="mt-10 pt-6 border-t border-gray-200 text-center text-xs text-gray-400 print:mt-6">
          <p>{audit.organization.name} · Unidad de Auditoría Interna · AuditMind</p>
          <p>Informe generado: {new Date(report.generatedAt).toLocaleString('es-CL')}</p>
          {isPreliminary
            ? <p className="mt-1 text-amber-500 font-semibold">BORRADOR PRELIMINAR — CONFIDENCIAL — NO DISTRIBUIR</p>
            : <p className="mt-1 text-gray-300">Documento confidencial — Uso interno exclusivo</p>
          }
        </div>
      </div>

      {/* CSS print */}
      <style jsx global>{`
        @media print {
          body { background: white; }
          @page { margin: 1.5cm; size: A4; }
        }
      `}</style>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AuditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-[#0F2D4A] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ReportContent id={id} />
    </Suspense>
  );
}
