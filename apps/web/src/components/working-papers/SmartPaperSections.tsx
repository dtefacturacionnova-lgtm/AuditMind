'use client';

import { useState } from 'react';
import { Loader2, LayoutTemplate, CheckCircle2 } from 'lucide-react';
import {
  usePaperSections,
  useUpdateSection,
  useInitFromTemplate,
  useMentionIndex,
  useCreateReference,
  usePropagateTrialBalance,
} from '@/hooks/useWorkingPaperGraph';
import { SectionField } from './SectionField';
import type { AiDraftConfig } from './SectionField';
import { TrialBalanceImporter, AccountClassifier, AccountSemaforo } from './TrialBalancePanel';
import { MaterialidadPanel } from './MaterialidadPanel';

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
  // ── Fiscal El Salvador v6.1 — NACOT 2018 ──
  { key: 'PT-FISC-INDEP',   label: 'Fiscal · Independencia NACOT/CIEPC (PT-FISC-INDEP)' },
  { key: 'PT-FISC-QC',      label: 'Fiscal · Control de Calidad del Encargo (PT-FISC-QC)' },
  { key: 'PT-FISC-ENCARGO', label: 'Fiscal · Carta de Encargo NACOT (PT-FISC-ENCARGO)' },
  { key: 'PT-FISC-RISK',    label: 'Fiscal · Riesgo de Incumplimiento NIA315+NACOT (PT-FISC-RISK)' },
  { key: 'PT-FISC-AML',     label: 'Fiscal · Anti-Lavado LCLDA (PT-FISC-AML)' },
  { key: 'PT-FISC-PT',      label: 'Fiscal · Precios de Transferencia OCDE (PT-FISC-PT)' },
  { key: 'PT-FISC-ZF',      label: 'Fiscal · Dictamen Semestral Zona Franca (PT-FISC-ZF)' },
  { key: 'PT-FISC-DICT',    label: 'Fiscal · Dictamen NACOT Anexo 1 (PT-FISC-DICT)' },
  // ── Auditoría Financiera Externa v1.0 — Lead Schedules Automáticos ──────
  { key: 'PT-FIN-B00', label: 'Fin.Ext · EEFF Importación + Clasificador de Cuentas (PT-FIN-B00)' },
  { key: 'PT-FIN-B01', label: 'Fin.Ext · Cédula Sumaria Activos Corrientes (PT-FIN-B01)'          },
  { key: 'PT-FIN-B02', label: 'Fin.Ext · Cédula Sumaria Activos No Corrientes (PT-FIN-B02)'       },
  { key: 'PT-FIN-B03', label: 'Fin.Ext · Cédula Sumaria Pasivos Corrientes (PT-FIN-B03)'          },
  { key: 'PT-FIN-B04', label: 'Fin.Ext · Cédula Sumaria Pasivos No Corrientes (PT-FIN-B04)'       },
  { key: 'PT-FIN-B05', label: 'Fin.Ext · Cédula Sumaria Patrimonio (PT-FIN-B05)'                  },
  { key: 'PT-FIN-B06', label: 'Fin.Ext · Cédula Sumaria Resultados P&G (PT-FIN-B06)'              },
  { key: 'PT-FIN-B07', label: 'Fin.Ext · Análisis de Variaciones NIA 520 (PT-FIN-B07)'            },
  { key: 'PT-FIN-B08', label: 'Fin.Ext · Cédula Diferencias + Semáforo Opinión NIA 450 (PT-FIN-B08)' },
  { key: 'PT-FIN-B09',    label: 'Fin.Ext · Libro de AJEs con Base Técnica NIIF (PT-FIN-B09)'                    },
  // ── Ejecución (C papers) ────────────────────────────────────────────────────────────────────
  { key: 'PT-FIN-C-SUST', label: 'Fin.Ext · Prueba Sustantiva de Ejecución — C-01..C-12, C-14 (PT-FIN-C-SUST)' },
  { key: 'PT-FIN-C-NORM', label: 'Fin.Ext · Análisis Normativo de Ejecución — C-13, C-15 (PT-FIN-C-NORM)'      },
  // ── Cierre e Informe ────────────────────────────────────────────────────────────────────────
  { key: 'PT-FIN-DICT',   label: 'Fin.Ext · Dictamen del Auditor Independiente NIA 700-720 (PT-FIN-DICT)'      },
  { key: 'PT-FIN-D02CI',  label: 'Fin.Ext · Carta de Debilidades Control Interno NIA 265 (PT-FIN-D02CI)'       },
  // ── Archivo Permanente / Conocimiento ────────────────────────────────────
  { key: 'PT-FIN-A3-KC',  label: 'Fin.Ext · Conocimiento del Cliente y su Entorno NIA 315 (PT-FIN-A3-KC)'    },
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
  const updateSection       = useUpdateSection();
  const createReference     = useCreateReference();
  const propagateTrialBal   = usePropagateTrialBalance();
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

  // Lookup helpers for PT-FIN-B00 specialized rendering
  const s1Section = sorted.find(s => s.sectionKey === 'S1');
  const s2Section = sorted.find(s => s.sectionKey === 'S2');

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

      {/* PT-A4 — Panel de materialidad: auto-calcula MG/ME/UAE desde S1b × S2 */}
      {paperCode === 'PT-A4' && (
        <MaterialidadPanel
          sections={sorted}
          readonly={readonly}
          onSave={handleSave}
        />
      )}

      {/* Sections */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 divide-y divide-gray-100">
        {sorted.map(section => {
          // PT-FIN-B00: S1 → importador de balance, S2 → clasificador de cuentas
          if (paperCode === 'PT-FIN-B00') {
            if (section.sectionKey === 'S1') {
              return (
                <TrialBalanceImporter
                  key="S1"
                  section={section}
                  readonly={readonly}
                  onSave={handleSave}
                />
              );
            }
            if (section.sectionKey === 'S2' && s1Section) {
              return (
                <AccountClassifier
                  key={`classifier-${Array.isArray(s1Section.value) ? (s1Section.value as unknown[]).length : 0}`}
                  s1Section={s1Section}
                  s2Section={section}
                  readonly={readonly}
                  onSave={handleSave}
                  onPropagate={
                    !readonly
                      ? () => propagateTrialBal.mutateAsync(paperId)
                      : undefined
                  }
                />
              );
            }
            if (section.sectionKey === 'S6' && s1Section) {
              return (
                <AccountSemaforo
                  key="S6"
                  s1Section={s1Section}
                  s2Section={s2Section}
                  s6Section={section}
                  auditId={auditId}
                  readonly={readonly}
                  onSave={handleSave}
                />
              );
            }
          }

          // PT-A4: S1..S5 son renderizados por MaterialidadPanel — se omiten aquí
          if (paperCode === 'PT-A4' && ['S1', 'S1b', 'S2', 'S3', 'S4', 'S5'].includes(section.sectionKey)) {
            return null;
          }

          return (
            <SectionField
              key={section.sectionKey}
              section={section}
              readonly={readonly}
              onSave={handleSave}
              paperId={paperId}
              mentionItems={mentionItems}
              aiDraftConfig={aiDraftConfig}
              onMentionSelect={(sectionKey, targetPaperId, targetSectionKey) => {
                void createReference.mutateAsync({
                  paperId,
                  sourceSectionKey: sectionKey,
                  targetPaperId,
                  targetSectionKey,
                });
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
