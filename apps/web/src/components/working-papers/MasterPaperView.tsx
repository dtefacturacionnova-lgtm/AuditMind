'use client';

import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, Clock, Sparkles, BookOpen, ShieldAlert, Scale, FileCheck } from 'lucide-react';
import { useConsolidatePaper } from '@/hooks/useWorkingPaperGraph';
import type { WpSyncStatus } from '@/hooks/useWorkingPapers';
import type { WpPaperSection } from '@/hooks/useWorkingPapers';
import { LeadScheduleMasterView } from './LeadScheduleMasterView';

// ─── Lead schedule config (frontend mirror of backend LEAD_SCHEDULE_CONFIG) ──

const LS_CONFIG: Record<string, {
  groupName: string; prefix: string;
  detailSections: { key: string; label: string; subSumaria: string }[];
  analysisSectionKey: string; proceduresSectionKey: string; conclusionSectionKey: string;
}> = {
  'PT-FIN-B01': { groupName: 'Activos Corrientes',   prefix: 'B-01',
    detailSections: [{ key:'S2', label:'Caja y Bancos', subSumaria:'B-01a' },{ key:'S3', label:'Cuentas por Cobrar', subSumaria:'B-01b' },{ key:'S4', label:'Inventarios', subSumaria:'B-01c' },{ key:'S5', label:'Otros Activos Corrientes', subSumaria:'B-01d' }],
    analysisSectionKey:'S6', proceduresSectionKey:'S7', conclusionSectionKey:'S9' },
  'PT-FIN-B02': { groupName: 'Activos No Corrientes', prefix: 'B-02',
    detailSections: [{ key:'S2', label:'Propiedad, Planta y Equipo', subSumaria:'B-02a' },{ key:'S3', label:'Activos Intangibles', subSumaria:'B-02b' },{ key:'S4', label:'Inversiones LP', subSumaria:'B-02c' }],
    analysisSectionKey:'S5', proceduresSectionKey:'S6', conclusionSectionKey:'S8' },
  'PT-FIN-B03': { groupName: 'Pasivos Corrientes',    prefix: 'B-03',
    detailSections: [{ key:'S2', label:'Proveedores y CxP', subSumaria:'B-03a' },{ key:'S3', label:'Obligaciones Financieras CP', subSumaria:'B-03b' },{ key:'S4', label:'Impuestos y Retenciones', subSumaria:'B-03c' }],
    analysisSectionKey:'S5', proceduresSectionKey:'S6', conclusionSectionKey:'S8' },
  'PT-FIN-B04': { groupName: 'Pasivos No Corrientes', prefix: 'B-04',
    detailSections: [{ key:'S2', label:'Deuda LP y Pasivos Financieros', subSumaria:'B-04a' }],
    analysisSectionKey:'S3', proceduresSectionKey:'S4', conclusionSectionKey:'S6' },
  'PT-FIN-B05': { groupName: 'Patrimonio',            prefix: 'B-05',
    detailSections: [{ key:'S2', label:'Capital y Reservas', subSumaria:'B-05a' }],
    analysisSectionKey:'S3', proceduresSectionKey:'S4', conclusionSectionKey:'S6' },
  'PT-FIN-B06': { groupName: 'Resultados (P&G)',       prefix: 'B-06',
    detailSections: [{ key:'S2', label:'Ingresos', subSumaria:'B-06a' },{ key:'S3', label:'Costo de Ventas', subSumaria:'B-06b' },{ key:'S4', label:'Gastos Operativos', subSumaria:'B-06c' },{ key:'S5', label:'Otros Ingresos/Gastos', subSumaria:'B-06d' }],
    analysisSectionKey:'S6', proceduresSectionKey:'S7', conclusionSectionKey:'S9' },
};

// ─── Narrative renderer ───────────────────────────────────────────────────────
// Renders text with inline source citations like [PT-A1] highlighted.

function NarrativeDisplay({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed space-y-3">
      {text.split('\n\n').map((para, pi) => {
        // Render markdown headings (### prefix)
        if (para.startsWith('### ')) {
          return (
            <h4 key={pi} className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-4 mb-1">
              {para.replace(/^###\s+/, '')}
            </h4>
          );
        }
        // Render bold **text**
        return (
          <p key={pi}>
            {para.split(/(\[[A-Z0-9-]+\]|\*\*[^*]+\*\*)/g).map((part, i) => {
              if (/^\[[A-Z0-9-]+\]$/.test(part)) {
                return (
                  <span
                    key={i}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 text-blue-700 border border-blue-200 mx-0.5 align-middle"
                  >
                    {part}
                  </span>
                );
              }
              if (/^\*\*[^*]+\*\*$/.test(part)) {
                return <strong key={i}>{part.replace(/\*\*/g, '')}</strong>;
              }
              return part;
            })}
          </p>
        );
      })}
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

interface SectionCardProps {
  icon:   React.ElementType;
  title:  string;
  color:  string;
  value:  unknown;
  empty?: string;
}

function SectionCard({ icon: Icon, title, color, value, empty }: SectionCardProps) {
  const text = valueToText(value);

  return (
    <div className={`rounded-xl border ${color} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 shrink-0" />
        <p className="text-xs font-bold uppercase tracking-wide">{title}</p>
      </div>
      {text ? (
        <NarrativeDisplay text={text} />
      ) : (
        <p className="text-xs text-gray-400 italic">{empty ?? 'Pendiente de consolidación.'}</p>
      )}
    </div>
  );
}

function valueToText(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

// ─── Sync status badge ────────────────────────────────────────────────────────

function SyncStatusBadge({ syncStatus }: { syncStatus: WpSyncStatus }) {
  switch (syncStatus) {
    case 'SYNCED':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Al día
        </span>
      );
    case 'STALE':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5" />
          Desactualizado
        </span>
      );
    case 'REGENERATING':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200 animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Consolidando con IA…
        </span>
      );
    default: // DRAFT
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
          <Clock className="w-3.5 h-3.5" />
          Sin consolidar
        </span>
      );
  }
}

// ─── MasterPaperView ──────────────────────────────────────────────────────────

interface MasterPaperViewProps {
  paperId:       string;
  syncStatus:    WpSyncStatus;
  narrative?:    string;
  sections?:     WpPaperSection[];
  staleCount?:   number;
  lastSyncedAt?: string;
  paperCode?:    string | null;
  auditId?:      string | null;
}

export function MasterPaperView({
  paperId,
  syncStatus,
  narrative,
  sections = [],
  staleCount = 0,
  lastSyncedAt,
  paperCode,
  auditId,
}: MasterPaperViewProps) {
  const consolidate = useConsolidatePaper();

  // ── Route B-series lead schedule papers to their dedicated view ────────────
  const lsConfig = paperCode ? LS_CONFIG[paperCode] : null;
  if (lsConfig && auditId) {
    return (
      <LeadScheduleMasterView
        paperId={paperId}
        paperCode={paperCode!}
        auditId={auditId}
        syncStatus={syncStatus}
        sections={sections}
        lastSyncedAt={lastSyncedAt}
        config={lsConfig}
      />
    );
  }

  async function handleConsolidate() {
    await consolidate.mutateAsync(paperId);
  }

  const isRegenerating = syncStatus === 'REGENERATING' || consolidate.isPending;

  // PI.2 — count stale sections from the sections list (most accurate),
  // falling back to staleCount prop if sections is empty
  const computedStaleCount = sections.length > 0
    ? sections.filter(s => s.isStale).length
    : staleCount;

  // Find key sections for structured display
  const S2 = sections.find(s => s.sectionKey === 'S2');
  const S3 = sections.find(s => s.sectionKey === 'S3');
  const S4 = sections.find(s => s.sectionKey === 'S4');
  const S8 = sections.find(s => s.sectionKey === 'S8');
  const hasSectionContent = [S2, S3, S4, S8].some(s => s && valueToText(s.value).length > 10);

  return (
    <div className="space-y-4">

      {/* ── Status banner ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SyncStatusBadge syncStatus={isRegenerating ? 'REGENERATING' : syncStatus} />
            {lastSyncedAt && syncStatus === 'SYNCED' && (
              <span className="text-xs text-gray-400">
                Última consolidación:{' '}
                {new Intl.DateTimeFormat('es-CL', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                }).format(new Date(lastSyncedAt))}
              </span>
            )}
          </div>

          {(syncStatus === 'DRAFT' || syncStatus === 'SYNCED') && !isRegenerating && (
            <button
              onClick={handleConsolidate}
              disabled={consolidate.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              {syncStatus === 'SYNCED' ? 'Reconsolidar' : 'Consolidar'}
            </button>
          )}
        </div>
      </div>

      {/* ── STALE banner ── */}
      {syncStatus === 'STALE' && !isRegenerating && (
        <div className="flex items-center justify-between gap-4 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Una fuente cambió</p>
              <p className="text-xs text-amber-600 mt-0.5">
                {computedStaleCount > 0
                  ? `${computedStaleCount} sección${computedStaleCount !== 1 ? 'es' : ''} desactualizada${computedStaleCount !== 1 ? 's' : ''} — revísalas individualmente o reconsolida el papel completo.`
                  : 'Uno o más papeles fuente se han actualizado. ¿Deseas reconsolidar?'}
              </p>
            </div>
          </div>
          <button
            onClick={handleConsolidate}
            disabled={consolidate.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-xl hover:bg-amber-700 disabled:opacity-50 shrink-0 transition-colors"
          >
            {consolidate.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Procesando…</>
            ) : (
              <><RefreshCw className="w-4 h-4" /> Consolidar ahora</>
            )}
          </button>
        </div>
      )}

      {/* ── Regenerating state ── */}
      {isRegenerating && (
        <div className="flex flex-col items-center py-14 gap-5 bg-white rounded-2xl border border-blue-200 shadow-sm">
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-bounce"
                style={{ animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
          <div className="text-center">
            <p className="text-sm text-blue-700 font-semibold">El agente IA está consolidando el memorando…</p>
            <p className="text-xs text-gray-400 mt-1">
              Analizando PT-A1, PT-A2 y PT-A4 · Generando narrativa con Gemini
            </p>
          </div>
          <p className="text-[10px] text-gray-300">
            La página se actualizará automáticamente al finalizar
          </p>
        </div>
      )}

      {/* ── Section-level narrative (SYNCED) ── */}
      {!isRegenerating && syncStatus === 'SYNCED' && hasSectionContent && (
        <div className="space-y-3">
          {S2 && (
            <SectionCard
              icon={BookOpen}
              title="I. Entendimiento del Negocio"
              color="bg-blue-50 border-blue-100 text-blue-800"
              value={S2.value}
              empty="Sin datos del PT-A1 aún."
            />
          )}
          {S3 && (
            <SectionCard
              icon={ShieldAlert}
              title="II. Evaluación de Riesgo Inherente"
              color="bg-amber-50 border-amber-100 text-amber-800"
              value={S3.value}
              empty="Sin datos del PT-A2 aún."
            />
          )}
          {S4 && (
            <SectionCard
              icon={Scale}
              title="III. Materialidad NIA 320"
              color="bg-emerald-50 border-emerald-100 text-emerald-800"
              value={S4.value}
              empty="Sin datos del PT-A4 aún."
            />
          )}
          {S8 && (
            <SectionCard
              icon={FileCheck}
              title="IV. Conclusión y Enfoque de Auditoría"
              color="bg-violet-50 border-violet-100 text-violet-800"
              value={S8.value}
              empty="El auditor debe completar este campo."
            />
          )}

          {/* Full narrative fallback if section view doesn't cover everything */}
          {narrative && !hasSectionContent && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Narrativa consolidada
              </p>
              <NarrativeDisplay text={narrative} />
            </div>
          )}
        </div>
      )}

      {/* ── Narrative only (no sections initialized yet) ── */}
      {!isRegenerating && syncStatus === 'SYNCED' && !hasSectionContent && narrative && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Narrativa consolidada
          </p>
          <NarrativeDisplay text={narrative} />
        </div>
      )}

      {/* ── Empty DRAFT state ── */}
      {!isRegenerating && (syncStatus === 'DRAFT') && (
        <div className="flex flex-col items-center py-16 gap-4 bg-white rounded-2xl border border-gray-200 shadow-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-violet-50 border border-violet-200 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-violet-300" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-700 mb-1">
              Este papel maestro aún no tiene contenido consolidado
            </p>
            <p className="text-sm text-gray-400 max-w-sm">
              Haz clic en &ldquo;Consolidar&rdquo; para que la IA sintetice los datos de PT-A1, PT-A2
              y PT-A4 en un Memorando de Planificación completo.
            </p>
          </div>
          <button
            onClick={handleConsolidate}
            disabled={consolidate.isPending}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Consolidar ahora con IA
          </button>
        </div>
      )}
    </div>
  );
}
