'use client';

import { use } from 'react';
import { useAuditReport } from '@/hooks/useReports';
import { formatDate } from '@/lib/utils';
import { Printer } from 'lucide-react';

const SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: 'Crítico', HIGH: 'Alto', MEDIUM: 'Medio', LOW: 'Bajo', INFORMATIONAL: 'Informativo',
};
const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#d97706', LOW: '#2563eb', INFORMATIONAL: '#6b7280',
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8 print:mb-6">
      <h2 className="text-base font-bold text-[#0F2D4A] border-b-2 border-[#0F2D4A] pb-1 mb-4 uppercase tracking-wide">
        {title}
      </h2>
      {children}
    </div>
  );
}

function KpiBox({ label, value, color = '#1e293b' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 text-center">
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

export default function AuditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
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

  const { audit, summary, findings, workingPapers, pbcRequests, confirmations } = report;

  return (
    <div className="min-h-screen bg-white">
      {/* Print toolbar — se oculta al imprimir */}
      <div className="print:hidden sticky top-0 z-10 bg-[#0F2D4A] text-white px-6 py-3 flex items-center justify-between shadow">
        <div>
          <p className="text-sm font-semibold">{audit.title}</p>
          <p className="text-xs text-blue-300">Informe generado: {new Date(report.generatedAt).toLocaleString('es-CL')}</p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-white text-[#0F2D4A] rounded-xl text-sm font-semibold hover:bg-blue-50 transition-colors"
        >
          <Printer className="w-4 h-4" />
          Imprimir / PDF
        </button>
      </div>

      {/* Contenido del informe */}
      <div className="max-w-4xl mx-auto px-8 py-10 print:px-6 print:py-8 print:max-w-full">

        {/* ── Portada ─────────────────────────────────────────────────────── */}
        <div className="mb-10 pb-8 border-b-4 border-[#0F2D4A]">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs font-bold uppercase text-gray-400 tracking-widest mb-1">
                {audit.organization.name}
              </p>
              <h1 className="text-2xl font-bold text-[#0F2D4A] leading-tight">{audit.title}</h1>
              <p className="text-sm text-gray-500 mt-1">{audit.auditEntity.name} — {audit.auditEntity.category}</p>
            </div>
            <div className="text-right shrink-0 ml-8">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-[#0F2D4A] text-white uppercase">
                {audit.type}
              </span>
              {audit.code && <p className="text-xs text-gray-400 mt-1">{audit.code}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Período</p>
              <p className="font-medium text-gray-700">{formatDate(audit.startDate)} — {formatDate(audit.endDate)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Auditor responsable</p>
              <p className="font-medium text-gray-700">{audit.lead?.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Materialidad</p>
              <p className="font-medium text-gray-700">{audit.materiality?.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' }) ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Nivel de riesgo</p>
              <p className="font-medium text-gray-700">{audit.riskLevel}</p>
            </div>
          </div>
        </div>

        {/* ── Resumen ejecutivo ────────────────────────────────────────────── */}
        <Section title="Resumen Ejecutivo">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <KpiBox label="Hallazgos totales"  value={summary.findings.total} />
            <KpiBox label="Hallazgos críticos" value={summary.findings.critical} color="#dc2626" />
            <KpiBox label="Hallazgos cerrados" value={summary.findings.closed} color="#16a34a" />
            <KpiBox label="Papeles aprobados"  value={summary.workingPapers.approved} color="#2563eb" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <KpiBox label="Horas planificadas" value={audit.estimatedHours} />
            <KpiBox label="Horas consumidas"   value={audit.actualHours}
              color={Math.abs(audit.hoursVariancePct) > 20 ? '#dc2626' : '#16a34a'} />
            <KpiBox label="Varianza horas"
              value={`${audit.hoursVariancePct > 0 ? '+' : ''}${audit.hoursVariancePct}%`}
              color={Math.abs(audit.hoursVariancePct) > 20 ? '#dc2626' : '#16a34a'} />
            <KpiBox label="Confirmaciones rec." value={`${summary.confirmations.reconciled}/${summary.confirmations.total}`} />
          </div>

          {audit.overallConclusion && (
            <div className="bg-gray-50 rounded-xl p-4 border-l-4 border-[#0F2D4A]">
              <p className="text-xs font-bold text-gray-500 uppercase mb-2">Conclusión general</p>
              <p className="text-sm text-gray-700 leading-relaxed">{audit.overallConclusion}</p>
            </div>
          )}
        </Section>

        {/* ── Alcance y objetivos ──────────────────────────────────────────── */}
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
              <tr className="bg-gray-100 text-left">
                <th className="px-3 py-2 text-xs font-semibold text-gray-600 rounded-tl-lg">Nombre</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-600">Rol en equipo</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-600 rounded-tr-lg">Email</th>
              </tr>
            </thead>
            <tbody>
              {audit.team.map((m, i) => (
                <tr key={m.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-3 py-2 font-medium text-gray-800">{m.name}</td>
                  <td className="px-3 py-2 text-gray-600">{m.teamRole}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{m.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* ── Hallazgos ────────────────────────────────────────────────────── */}
        <Section title={`Hallazgos (${summary.findings.total})`}>
          {/* Distribución por severidad */}
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(summary.findings.bySeverity).map(([sev, count]) => (
              <span key={sev} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: SEVERITY_COLORS[sev] ?? '#6b7280' }}>
                {SEVERITY_LABELS[sev] ?? sev}: {count}
              </span>
            ))}
          </div>

          {!findings.length ? (
            <p className="text-sm text-gray-400">Sin hallazgos registrados</p>
          ) : (
            <div className="space-y-4">
              {findings.map((f, idx) => (
                <div key={f.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-2.5"
                    style={{ backgroundColor: `${SEVERITY_COLORS[f.severity]}15` }}>
                    <span className="text-xs font-bold px-2 py-0.5 rounded text-white"
                      style={{ backgroundColor: SEVERITY_COLORS[f.severity] ?? '#6b7280' }}>
                      {SEVERITY_LABELS[f.severity] ?? f.severity}
                    </span>
                    <p className="flex-1 text-sm font-semibold text-gray-800">{f.title}</p>
                    <span className="text-xs text-gray-500">{f.status}</span>
                    {f.isMaterial && (
                      <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                        MATERIAL
                      </span>
                    )}
                  </div>
                  <div className="px-4 py-3 space-y-2 text-sm">
                    {f.description && (
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase">Descripción</p>
                        <p className="text-gray-700 leading-relaxed">{f.description}</p>
                      </div>
                    )}
                    {f.root_cause && (
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase">Causa raíz</p>
                        <p className="text-gray-700 leading-relaxed">{f.root_cause}</p>
                      </div>
                    )}
                    {f.impact && (
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase">Impacto</p>
                        <p className="text-gray-700 leading-relaxed">{f.impact}</p>
                      </div>
                    )}
                    {f.recommendation && (
                      <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase">Recomendación</p>
                        <p className="text-gray-700 leading-relaxed">{f.recommendation}</p>
                      </div>
                    )}
                    <div className="flex gap-4 pt-1 text-xs text-gray-500 flex-wrap">
                      {f.effectAmount != null && (
                        <span>Monto: {f.effectAmount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}</span>
                      )}
                      {f.dueDate && <span>Vence: {formatDate(f.dueDate)}</span>}
                      {f.qualityScore != null && <span>Score calidad: {f.qualityScore}/100</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Papeles de trabajo ───────────────────────────────────────────── */}
        <Section title={`Índice de Papeles de Trabajo (${workingPapers.length})`}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="px-3 py-2 text-xs font-semibold text-gray-600">Índice</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-600">Título</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-600">Tipo</th>
                <th className="px-3 py-2 text-xs font-semibold text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody>
              {workingPapers.map((wp, i) => (
                <tr key={wp.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{wp.indexRef ?? '—'}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{wp.title}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{WP_TYPE_LABELS[wp.type] ?? wp.type}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{wp.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* ── PBC ─────────────────────────────────────────────────────────── */}
        {pbcRequests.length > 0 && (
          <Section title={`Solicitudes PBC (${pbcRequests.length})`}>
            <div className="flex gap-4 mb-3 text-sm">
              <span className="text-emerald-600 font-medium">{summary.pbc.accepted} aceptadas</span>
              <span className="text-amber-600 font-medium">{summary.pbc.pending} pendientes</span>
            </div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-left">Solicitud</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-left">Auditado</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-left">Estado</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-left">Vence</th>
                </tr>
              </thead>
              <tbody>
                {pbcRequests.map((p, i) => (
                  <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-3 py-2 font-medium text-gray-800">{p.title}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{p.requestedToName}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{p.status}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{p.dueDate ? formatDate(p.dueDate) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* ── Confirmaciones ───────────────────────────────────────────────── */}
        {confirmations.length > 0 && (
          <Section title={`Confirmaciones Externas NIA 505 (${confirmations.length})`}>
            <div className="flex gap-4 mb-3 text-sm">
              <span className="text-emerald-600 font-medium">{summary.confirmations.reconciled} conciliadas</span>
              <span className="text-amber-600 font-medium">{summary.confirmations.pending} pendientes</span>
            </div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-left">Tipo</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-left">Respondente</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">Monto libros</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">Respuesta</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">Diferencia</th>
                  <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-left">Estado</th>
                </tr>
              </thead>
              <tbody>
                {confirmations.map((c, i) => (
                  <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-3 py-2 text-xs text-gray-600">{c.type}</td>
                    <td className="px-3 py-2 text-gray-800 font-medium">{c.respondentName}</td>
                    <td className="px-3 py-2 text-xs text-right text-gray-600">
                      {c.amount != null ? c.amount.toLocaleString('es-CL') : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-right text-gray-600">
                      {c.respondedAmount != null ? c.respondedAmount.toLocaleString('es-CL') : '—'}
                    </td>
                    <td className={`px-3 py-2 text-xs text-right font-medium ${
                      c.difference != null && c.difference !== 0 ? 'text-red-600' : 'text-emerald-600'
                    }`}>
                      {c.difference != null ? c.difference.toLocaleString('es-CL') : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* ── Pie de página ────────────────────────────────────────────────── */}
        <div className="mt-10 pt-6 border-t border-gray-200 text-center text-xs text-gray-400 print:mt-6">
          <p>{audit.organization.name} · AuditMind</p>
          <p>Informe generado: {new Date(report.generatedAt).toLocaleString('es-CL')}</p>
          <p className="mt-1 text-gray-300">Documento de uso interno — Confidencial</p>
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
