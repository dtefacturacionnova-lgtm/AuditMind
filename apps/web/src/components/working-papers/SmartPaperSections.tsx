'use client';

import { useState } from 'react';
import { Loader2, LayoutTemplate, CheckCircle2 } from 'lucide-react';
import {
  usePaperSections,
  useUpdateSection,
  useInitFromTemplate,
  useMentionIndex,
  useCreateReference,
} from '@/hooks/useWorkingPaperGraph';
import { SectionField } from './SectionField';
import type { AiDraftConfig } from './SectionField';

// ─── Template key selector ────────────────────────────────────────────────────

// Las claves DEBEN coincidir con PAPER_TEMPLATES del backend (paperCode).
// Ver apps/api/src/working-papers/paper-templates.ts
const AVAILABLE_TEMPLATES = [
  { key: 'PT-A1',       label: 'Entendimiento del Negocio (PT-A1)' },
  { key: 'PT-A2',       label: 'Evaluación de Riesgo Inherente (PT-A2)' },
  { key: 'PT-A3',       label: 'Evaluación de Control Interno (PT-A3)' },
  { key: 'PT-A4',       label: 'Materialidad (PT-A4)' },
  { key: 'PT-COSO',     label: 'Evaluación COSO 2013 (PT-COSO)' },
  { key: 'PT-MEMO',     label: 'Memorando de Planificación (PT-MEMO)' },
  { key: 'PT-PROG',     label: 'Programa de Auditoría (PT-PROG)' },
  { key: 'PT-EEFF',     label: 'Estados Financieros / Cédula Madre (PT-EEFF)' },
  { key: 'PT-DIFS',     label: 'Cédula de Diferencias (PT-DIFS)' },
  { key: 'PT-GOV-HAL',  label: 'Hallazgo Gubernamental (PT-GOV-HAL)' },
  { key: 'PT-SEC-RISK', label: 'Riesgo de Seguridad TI (PT-SEC-RISK)' },
  { key: 'PT-BIA',      label: 'Análisis de Impacto al Negocio (PT-BIA)' },
  { key: 'PT-AML-RISK', label: 'Riesgo LA/FT — AML (PT-AML-RISK)' },
];

function InitFromTemplatePanel({
  paperId,
  defaultKey,
  onDone,
}: {
  paperId: string;
  defaultKey?: string;
  onDone: () => void;
}) {
  // Pre-select the paper's own paperCode if it matches an available template
  const initialKey = defaultKey && AVAILABLE_TEMPLATES.some(t => t.key === defaultKey)
    ? defaultKey
    : '';
  const [selected, setSelected] = useState(initialKey);
  const initMutation = useInitFromTemplate();

  async function handleInit() {
    if (!selected) return;
    await initMutation.mutateAsync({ paperId, templateKey: selected });
    onDone();
  }

  return (
    <div className="flex flex-col items-center py-16 gap-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center">
        <LayoutTemplate className="w-8 h-8 text-blue-400" />
      </div>
      <div>
        <p className="text-base font-semibold text-gray-800 mb-1">
          Este papel no tiene secciones todavía
        </p>
        <p className="text-sm text-gray-400 max-w-sm">
          Elige una plantilla para inicializar las secciones estructuradas de este papel inteligente.
        </p>
      </div>

      <div className="w-full max-w-xs space-y-3">
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">— Seleccionar plantilla —</option>
          {AVAILABLE_TEMPLATES.map(t => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>

        <button
          onClick={handleInit}
          disabled={!selected || initMutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {initMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Inicializando…</>
          ) : (
            <><LayoutTemplate className="w-4 h-4" /> Inicializar secciones</>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function SectionProgressBar({ filled, total }: { filled: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((filled / total) * 100);
  const color = pct === 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-blue-500' : 'bg-amber-400';

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 shrink-0 font-medium">
        {filled}/{total} secciones completas
      </span>
      {pct === 100 && (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      )}
    </div>
  );
}

// ─── SmartPaperSections ───────────────────────────────────────────────────────

interface SmartPaperSectionsProps {
  paperId:        string;
  auditId:        string;
  paperCode?:     string | null;
  readonly?:      boolean;
  aiDraftConfig?: AiDraftConfig;
}

export function SmartPaperSections({
  paperId,
  auditId,
  paperCode,
  readonly = false,
  aiDraftConfig,
}: SmartPaperSectionsProps) {
  const { data: sections, isLoading, error } = usePaperSections(paperId);
  const updateSection    = useUpdateSection();
  const createReference  = useCreateReference();
  const { data: mentionItems = [] } = useMentionIndex(auditId);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-600">Error al cargar secciones: {(error as Error).message}</p>
      </div>
    );
  }

  if (!sections || sections.length === 0) {
    return (
      <InitFromTemplatePanel
        paperId={paperId}
        defaultKey={paperCode ?? undefined}
        onDone={() => { /* query will auto-refresh */ }}
      />
    );
  }

  const sorted = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const required = sorted.filter(s => s.isRequired);
  const filled = required.filter(s => s.value !== null && s.value !== undefined && s.value !== '');

  async function handleSave(sectionKey: string, value: unknown) {
    setSavingKey(sectionKey);
    try {
      await updateSection.mutateAsync({ paperId, sectionKey, value });
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Completitud de secciones requeridas
        </p>
        <SectionProgressBar filled={filled.length} total={required.length} />
      </div>

      {/* Saving indicator */}
      {savingKey && (
        <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Guardando &ldquo;{sections.find(s => s.sectionKey === savingKey)?.label ?? savingKey}&rdquo;...
        </div>
      )}

      {/* Sections */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 divide-y divide-gray-100">
        {sorted.map(section => (
          <SectionField
            key={section.sectionKey}
            section={section}
            readonly={readonly}
            onSave={handleSave}
            paperId={paperId}
            mentionItems={mentionItems}
            aiDraftConfig={aiDraftConfig}
            onMentionSelect={(sectionKey, targetPaperId, targetSectionKey) => {
              // Fire-and-forget: persist the @mention reference
              void createReference.mutateAsync({
                paperId,
                sourceSectionKey: sectionKey,
                targetPaperId,
                targetSectionKey,
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}
