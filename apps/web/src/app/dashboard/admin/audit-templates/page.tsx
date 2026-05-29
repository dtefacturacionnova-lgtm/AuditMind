'use client';

import { useState } from 'react';
import {
  Plus, Pencil, Trash2, Star, Lock, Copy,
  X, Check, Loader2, ClipboardList, Eye, RefreshCw,
  FolderOpen, FolderPlus, ChevronDown, ChevronRight,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useAuditTemplates,
  useCreateAuditTemplate,
  useUpdateAuditTemplate,
  useDeleteAuditTemplate,
  useDuplicateAuditTemplate,
  useSetDefaultAuditTemplate,
  useReseedSystemTemplates,
  type AuditTemplate,
  type PaperDef,
  type SectionDef,
  type CreateAuditTemplateData,
  type WorkingPaperType,
  type WpKind,
} from '@/hooks/useAuditTemplates';
import { AUDIT_TYPES } from '@/lib/audit-types';
import { cn } from '@/lib/utils';

// ─── Label maps ───────────────────────────────────────────────────────────────

const WP_TYPE_LABELS: Record<WorkingPaperType, string> = {
  PLANNING_UNDERSTANDING: 'Planificación',
  CONTROL_EVALUATION:     'Controles',
  SUBSTANTIVE_TEST:       'Prueba Sust.',
  DATA_ANALYSIS:          'Análisis Datos',
  FINDING:                'Hallazgo',
  CLOSURE_CONCLUSION:     'Cierre',
  INTERVIEW:              'Entrevista',
  CONFIRMATION:           'Confirmación',
  NORMATIVE_ANALYSIS:     'Análisis Norm.',
};

const WP_KIND_LABELS: Record<WpKind, string> = {
  STANDARD: 'Estándar',
  SMART:    'SMART',
  MASTER:   'Maestro',
};

const WP_TYPES: WorkingPaperType[] = [
  'PLANNING_UNDERSTANDING',
  'CONTROL_EVALUATION',
  'SUBSTANTIVE_TEST',
  'DATA_ANALYSIS',
  'FINDING',
  'CLOSURE_CONCLUSION',
  'INTERVIEW',
  'CONFIRMATION',
  'NORMATIVE_ANALYSIS',
];

const WP_KINDS: WpKind[] = ['STANDARD', 'SMART', 'MASTER'];

type PhaseType = 'PLANNING' | 'FIELDWORK' | 'REPORTING' | 'FOLLOWUP';

const PHASE_TYPES: PhaseType[] = ['PLANNING', 'FIELDWORK', 'REPORTING', 'FOLLOWUP'];

const PHASE_TYPE_LABELS: Record<PhaseType, string> = {
  PLANNING:  'Planificación',
  FIELDWORK: 'Ejecución',
  REPORTING: 'Informe',
  FOLLOWUP:  'Seguimiento',
};

const PHASE_TYPE_COLORS: Record<PhaseType, string> = {
  PLANNING:  'bg-blue-50 text-blue-700 border-blue-200',
  FIELDWORK: 'bg-amber-50 text-amber-700 border-amber-200',
  REPORTING: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FOLLOWUP:  'bg-purple-50 text-purple-700 border-purple-200',
};

// ─── Empty helpers ────────────────────────────────────────────────────────────

function emptyPaper(): PaperDef {
  return {
    code: '',
    indexSection: 'A',
    title: '',
    type: 'PLANNING_UNDERSTANDING',
    wpKind: 'STANDARD',
    paperCode: '',
  };
}

function emptySection(): SectionDef {
  return { ref: '', name: '', phaseType: 'PLANNING', children: [] };
}

// ─── Sections editor ──────────────────────────────────────────────────────────

function SectionsEditor({
  sections,
  onChange,
  readOnly = false,
}: {
  sections: SectionDef[];
  onChange: (sections: SectionDef[]) => void;
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  function updateSection(idx: number, field: keyof SectionDef, value: any) {
    onChange(sections.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  }

  function removeSection(idx: number) {
    onChange(sections.filter((_, i) => i !== idx));
  }

  function addSection() {
    const next = [...sections, emptySection()];
    onChange(next);
    setExpanded((prev) => ({ ...prev, [next.length - 1]: false }));
  }

  function addChild(idx: number) {
    const updated = sections.map((s, i) => {
      if (i !== idx) return s;
      return { ...s, children: [...(s.children ?? []), { ref: '', name: '' }] };
    });
    onChange(updated);
    setExpanded((prev) => ({ ...prev, [idx]: true }));
  }

  function updateChild(sIdx: number, cIdx: number, field: 'ref' | 'name', value: string) {
    onChange(
      sections.map((s, i) => {
        if (i !== sIdx) return s;
        const children = (s.children ?? []).map((c, j) =>
          j === cIdx ? { ...c, [field]: value } : c,
        );
        return { ...s, children };
      }),
    );
  }

  function removeChild(sIdx: number, cIdx: number) {
    onChange(
      sections.map((s, i) => {
        if (i !== sIdx) return s;
        return { ...s, children: (s.children ?? []).filter((_, j) => j !== cIdx) };
      }),
    );
  }

  function toggleExpanded(idx: number) {
    setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  if (readOnly && sections.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic py-2">
        Esta plantilla del sistema no tiene una estructura de carpetas definida.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {sections.length === 0 && !readOnly && (
        <p className="text-xs text-slate-400 italic py-2">
          Sin carpetas definidas. Las carpetas estructuran el expediente de la auditoría.
        </p>
      )}

      {sections.map((section, idx) => {
        const hasChildren = (section.children?.length ?? 0) > 0;
        const isExpanded  = expanded[idx] ?? hasChildren;

        return (
          <div
            key={idx}
            className={cn(
              'rounded-lg border bg-white overflow-hidden',
              readOnly ? 'border-slate-200' : 'border-slate-200 hover:border-slate-300',
            )}
          >
            {/* Section row */}
            <div className="flex items-center gap-2 px-3 py-2">
              {/* Expand toggle */}
              <button
                type="button"
                onClick={() => toggleExpanded(idx)}
                className="shrink-0 text-slate-400 hover:text-slate-600 p-0.5"
                tabIndex={-1}
              >
                {isExpanded
                  ? <ChevronDown className="h-3.5 w-3.5" />
                  : <ChevronRight className="h-3.5 w-3.5" />}
              </button>

              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />

              {/* Ref */}
              {readOnly ? (
                <span className="w-14 font-mono text-xs font-semibold text-slate-700">{section.ref}</span>
              ) : (
                <input
                  value={section.ref}
                  onChange={(e) => updateSection(idx, 'ref', e.target.value)}
                  placeholder="Ref"
                  className="w-14 rounded border border-slate-200 px-1.5 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              )}

              {/* Name */}
              {readOnly ? (
                <span className="flex-1 text-xs text-slate-700">{section.name}</span>
              ) : (
                <input
                  value={section.name}
                  onChange={(e) => updateSection(idx, 'name', e.target.value)}
                  placeholder="Nombre de la carpeta"
                  className="flex-1 rounded border border-slate-200 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              )}

              {/* PhaseType */}
              {readOnly ? (
                <span className={cn(
                  'shrink-0 rounded border px-2 py-0.5 text-[10px] font-medium',
                  section.phaseType
                    ? PHASE_TYPE_COLORS[section.phaseType as PhaseType]
                    : 'bg-slate-50 text-slate-500 border-slate-200',
                )}>
                  {section.phaseType ? PHASE_TYPE_LABELS[section.phaseType as PhaseType] : '—'}
                </span>
              ) : (
                <select
                  value={section.phaseType ?? ''}
                  onChange={(e) => updateSection(idx, 'phaseType', e.target.value || undefined)}
                  className="w-32 rounded border border-slate-200 px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                >
                  <option value="">— Fase —</option>
                  {PHASE_TYPES.map((pt) => (
                    <option key={pt} value={pt}>{PHASE_TYPE_LABELS[pt]}</option>
                  ))}
                </select>
              )}

              {/* Actions */}
              {!readOnly && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => addChild(idx)}
                    title="Agregar subcarpeta"
                    className="rounded p-0.5 text-slate-400 hover:bg-blue-50 hover:text-blue-500"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSection(idx)}
                    className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Children rows */}
            {isExpanded && hasChildren && (
              <div className="border-t border-slate-100 bg-slate-50/60 divide-y divide-slate-100">
                {(section.children ?? []).map((child, cIdx) => (
                  <div key={cIdx} className="flex items-center gap-2 pl-10 pr-3 py-1.5">
                    <div className="h-3 w-3 shrink-0 text-slate-300">└</div>

                    {/* Child ref */}
                    {readOnly ? (
                      <span className="w-14 font-mono text-xs text-slate-500">{child.ref}</span>
                    ) : (
                      <input
                        value={child.ref}
                        onChange={(e) => updateChild(idx, cIdx, 'ref', e.target.value)}
                        placeholder="Ref"
                        className="w-14 rounded border border-slate-200 px-1.5 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      />
                    )}

                    {/* Child name */}
                    {readOnly ? (
                      <span className="flex-1 text-xs text-slate-500">{child.name}</span>
                    ) : (
                      <input
                        value={child.name}
                        onChange={(e) => updateChild(idx, cIdx, 'name', e.target.value)}
                        placeholder="Nombre de la subcarpeta"
                        className="flex-1 rounded border border-slate-200 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      />
                    )}

                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => removeChild(idx, cIdx)}
                        className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Collapsed children indicator */}
            {!isExpanded && hasChildren && (
              <div
                className="border-t border-slate-100 bg-slate-50/60 px-10 py-1 text-[10px] text-slate-400 cursor-pointer hover:bg-slate-100"
                onClick={() => toggleExpanded(idx)}
              >
                {section.children!.length} subcarpeta{section.children!.length !== 1 ? 's' : ''} — clic para expandir
              </div>
            )}
          </div>
        );
      })}

      {!readOnly && (
        <button
          type="button"
          onClick={addSection}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar carpeta
        </button>
      )}
    </div>
  );
}

// ─── Papers table editor ──────────────────────────────────────────────────────

function PapersEditor({
  papers,
  sections,
  onChange,
}: {
  papers: PaperDef[];
  sections: SectionDef[];
  onChange: (papers: PaperDef[]) => void;
}) {
  function updateRow(idx: number, field: keyof PaperDef, value: string) {
    const next = papers.map((p, i) => (i === idx ? { ...p, [field]: value } : p));
    onChange(next);
  }

  function removeRow(idx: number) {
    onChange(papers.filter((_, i) => i !== idx));
  }

  function addRow() {
    onChange([...papers, emptyPaper()]);
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-2 py-2 text-left font-medium text-slate-500 w-20">Código</th>
              <th className="px-2 py-2 text-left font-medium text-slate-500 w-44">Carpeta</th>
              <th className="px-2 py-2 text-left font-medium text-slate-500">Título</th>
              <th className="px-2 py-2 text-left font-medium text-slate-500 w-32">Tipo</th>
              <th className="px-2 py-2 text-left font-medium text-slate-500 w-24">Clase</th>
              <th className="px-2 py-2 text-left font-medium text-slate-500 w-24">Clave PT</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {papers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-xs text-slate-400">
                  Sin papeles. Agrega uno con el botón de abajo.
                </td>
              </tr>
            )}
            {papers.map((paper, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50">
                <td className="px-2 py-1">
                  <input
                    value={paper.code}
                    onChange={(e) => updateRow(idx, 'code', e.target.value)}
                    placeholder="A-01"
                    className="w-full rounded border border-slate-200 px-1.5 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </td>
                <td className="px-2 py-1">
                  {sections.length > 0 ? (
                    <select
                      value={paper.indexSection}
                      onChange={(e) => updateRow(idx, 'indexSection', e.target.value)}
                      className="w-full rounded border border-slate-200 px-1 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                    >
                      {sections.map((s) => (
                        <option key={s.ref} value={s.ref}>{s.ref} — {s.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={paper.indexSection}
                      onChange={(e) => updateRow(idx, 'indexSection', e.target.value)}
                      placeholder="A"
                      className="w-full rounded border border-slate-200 px-1.5 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  )}
                </td>
                <td className="px-2 py-1">
                  <input
                    value={paper.title}
                    onChange={(e) => updateRow(idx, 'title', e.target.value)}
                    placeholder="Título del papel"
                    className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    value={paper.type}
                    onChange={(e) => updateRow(idx, 'type', e.target.value)}
                    className="w-full rounded border border-slate-200 px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  >
                    {WP_TYPES.map((t) => (
                      <option key={t} value={t}>{WP_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <select
                    value={paper.wpKind}
                    onChange={(e) => updateRow(idx, 'wpKind', e.target.value)}
                    className="w-full rounded border border-slate-200 px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  >
                    {WP_KINDS.map((k) => (
                      <option key={k} value={k}>{WP_KIND_LABELS[k]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input
                    value={paper.paperCode ?? ''}
                    onChange={(e) => updateRow(idx, 'paperCode', e.target.value)}
                    placeholder="PT-A1"
                    className="w-full rounded border border-slate-200 px-1.5 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </td>
                <td className="px-2 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50"
      >
        <Plus className="h-3.5 w-3.5" /> Agregar papel
      </button>
    </div>
  );
}

// ─── Template view modal (read-only) ─────────────────────────────────────────

const WP_TYPE_COLORS: Record<WorkingPaperType, string> = {
  PLANNING_UNDERSTANDING: 'bg-blue-100 text-blue-700',
  CONTROL_EVALUATION:     'bg-purple-100 text-purple-700',
  SUBSTANTIVE_TEST:       'bg-amber-100 text-amber-700',
  DATA_ANALYSIS:          'bg-cyan-100 text-cyan-700',
  FINDING:                'bg-red-100 text-red-700',
  CLOSURE_CONCLUSION:     'bg-green-100 text-green-700',
  INTERVIEW:              'bg-orange-100 text-orange-700',
  CONFIRMATION:           'bg-teal-100 text-teal-700',
  NORMATIVE_ANALYSIS:     'bg-indigo-100 text-indigo-700',
};

const WP_KIND_COLORS: Record<WpKind, string> = {
  STANDARD: 'bg-slate-100 text-slate-600',
  SMART:    'bg-emerald-100 text-emerald-700',
  MASTER:   'bg-violet-100 text-violet-700',
};

function TemplateViewModal({
  template,
  onClose,
}: {
  template: AuditTemplate;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'papers' | 'structure'>('structure');
  const typeLabels = AUDIT_TYPES.reduce<Record<string, string>>((acc, t) => {
    acc[t.value] = t.label; return acc;
  }, {});

  // Group papers by indexSection
  const papersBySec = template.papers.reduce<Record<string, PaperDef[]>>((acc, p) => {
    (acc[p.indexSection] ??= []).push(p);
    return acc;
  }, {});
  const sectionKeys = Object.keys(papersBySec).sort();

  const hasSections = (template.sections?.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8">
      <div className="w-full max-w-4xl rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-slate-800 truncate">{template.name}</h2>
              {template.isSystem && (
                <span className="shrink-0 flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  <Lock className="h-2.5 w-2.5" /> Sistema
                </span>
              )}
              {template.isDefault && (
                <span className="shrink-0 flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                  <Star className="h-2.5 w-2.5" /> Predeterminada
                </span>
              )}
            </div>
            {template.description && (
              <p className="mt-1 text-xs text-slate-500">{template.description}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-1">
              {template.auditTypes.map((t) => (
                <span key={t} className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                  {typeLabels[t] ?? t}
                </span>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-slate-100 px-6">
          <button
            type="button"
            onClick={() => setTab('structure')}
            className={cn(
              'px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
              tab === 'structure'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            Estructura de carpetas {hasSections && `(${template.sections!.length})`}
          </button>
          <button
            type="button"
            onClick={() => setTab('papers')}
            className={cn(
              'px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
              tab === 'papers'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            Papeles de trabajo ({template.papers.length})
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Structure tab */}
          {tab === 'structure' && (
            <div className="space-y-2">
              {!hasSections ? (
                <p className="text-center text-sm text-slate-400 py-8">
                  Esta plantilla no tiene una estructura de carpetas definida.
                </p>
              ) : (
                <SectionsEditor
                  sections={template.sections ?? []}
                  onChange={() => {}}
                  readOnly
                />
              )}
            </div>
          )}

          {/* Papers tab */}
          {tab === 'papers' && (
            <>
              {template.papers.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-8">Esta plantilla no tiene papeles definidos.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {template.papers.length} {template.papers.length === 1 ? 'papel' : 'papeles'}
                    </p>
                  </div>

                  {sectionKeys.map((sec) => {
                    const secDef = template.sections?.find((s) => s.ref === sec);
                    return (
                      <div key={sec} className="space-y-1">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
                          {secDef ? `${sec} — ${secDef.name}` : `Sección ${sec}`}
                        </p>
                        <div className="overflow-hidden rounded-lg border border-slate-200">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50">
                                <th className="px-3 py-2 text-left font-medium text-slate-500 w-20">Código</th>
                                <th className="px-3 py-2 text-left font-medium text-slate-500">Título del papel</th>
                                <th className="px-3 py-2 text-left font-medium text-slate-500 w-36">Tipo</th>
                                <th className="px-3 py-2 text-left font-medium text-slate-500 w-24">Clase</th>
                                <th className="px-3 py-2 text-left font-medium text-slate-500 w-24">Clave PT</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {papersBySec[sec].map((paper, i) => (
                                <tr key={i} className="hover:bg-slate-50/60">
                                  <td className="px-3 py-2 font-mono text-slate-700 font-medium">{paper.code}</td>
                                  <td className="px-3 py-2 text-slate-700">{paper.title}</td>
                                  <td className="px-3 py-2">
                                    <span className={cn(
                                      'rounded-full px-2 py-0.5 text-[10px] font-medium',
                                      WP_TYPE_COLORS[paper.type],
                                    )}>
                                      {WP_TYPE_LABELS[paper.type]}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className={cn(
                                      'rounded-full px-2 py-0.5 text-[10px] font-medium',
                                      WP_KIND_COLORS[paper.wpKind],
                                    )}>
                                      {WP_KIND_LABELS[paper.wpKind]}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 font-mono text-slate-500 text-[11px]">
                                    {paper.paperCode ?? '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template editor modal ────────────────────────────────────────────────────

type EditorMode = 'create' | 'edit';

function TemplateEditorModal({
  mode,
  initial,
  onSave,
  onClose,
}: {
  mode: EditorMode;
  initial?: AuditTemplate;
  onSave: (data: CreateAuditTemplateData) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName]               = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [auditTypes, setAuditTypes]   = useState<string[]>(initial?.auditTypes ?? []);
  const [papers, setPapers]           = useState<PaperDef[]>(
    initial?.papers ? JSON.parse(JSON.stringify(initial.papers)) : [],
  );
  const [sections, setSections]       = useState<SectionDef[]>(
    initial?.sections ? JSON.parse(JSON.stringify(initial.sections)) : [],
  );
  const [isDefault, setIsDefault]     = useState(initial?.isDefault ?? false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [activeTab, setActiveTab]     = useState<'general' | 'structure' | 'papers'>('general');

  const isSystem = initial?.isSystem ?? false;

  function toggleType(value: string) {
    setAuditTypes((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value],
    );
  }

  const handleSave = async () => {
    if (!name.trim()) { setError('El nombre es obligatorio'); return; }
    if (auditTypes.length === 0) { setError('Selecciona al menos un tipo de auditoría'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        auditTypes,
        papers,
        sections: sections.length > 0 ? sections : undefined,
        isDefault,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8">
      <div className="w-full max-w-4xl rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              {mode === 'create' ? 'Nueva plantilla de auditoría' : `Editar plantilla${isSystem ? ' (Sistema)' : ''}`}
            </h2>
            {isSystem && (
              <p className="mt-0.5 text-xs text-slate-500 flex items-center gap-1">
                <Lock className="h-3 w-3" /> Las plantillas de sistema pueden editarse pero sus cambios se restauran con "Restaurar plantillas"
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 border-b border-slate-100 px-6">
          {(
            [
              { key: 'general',   label: 'General' },
              { key: 'structure', label: `Carpetas (${sections.length})` },
              { key: 'papers',    label: `Papeles (${papers.length})` },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={cn(
                'px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                activeTab === key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-6 min-h-[360px] max-h-[60vh] overflow-y-auto">
          {/* ── Tab: General ── */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Nombre <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ej. Auditoría Financiera Estándar"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Descripción</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Breve descripción de uso"
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-slate-600">
                  Tipos de auditoría aplicables <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {AUDIT_TYPES.map((t) => (
                    <label
                      key={t.value}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer transition-colors',
                        auditTypes.includes(t.value)
                          ? 'border-blue-400 bg-blue-50 text-blue-700'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={auditTypes.includes(t.value)}
                        onChange={() => toggleType(t.value)}
                        className="h-3.5 w-3.5 rounded accent-blue-600"
                      />
                      <span className="truncate">{t.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded accent-blue-600"
                />
                Establecer como plantilla predeterminada para estos tipos
              </label>
            </div>
          )}

          {/* ── Tab: Carpetas ── */}
          {activeTab === 'structure' && (
            <div className="space-y-3">
              {isSystem ? (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800 mb-3">
                  Las carpetas de las plantillas de sistema están predefinidas. Puedes verlas aquí, pero los cambios se sobrescribirán al restaurar las plantillas. Para estructuras personalizadas, duplica esta plantilla.
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Define las carpetas (y subcarpetas) que se crearán en el expediente cuando se use esta plantilla. Cada carpeta va asociada a una fase de la auditoría.
                </p>
              )}
              <SectionsEditor
                sections={sections}
                onChange={setSections}
                readOnly={isSystem}
              />
            </div>
          )}

          {/* ── Tab: Papeles ── */}
          {activeTab === 'papers' && (
            <div className="space-y-3">
              {sections.length === 0 && !isSystem && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5 text-xs text-blue-800">
                  Tip: define las carpetas en la pestaña "Carpetas" primero para que el campo "Carpeta" de los papeles sea un selector en lugar de texto libre.
                </div>
              )}
              <PapersEditor
                papers={papers}
                sections={sections}
                onChange={setPapers}
              />
            </div>
          )}
        </div>

        {error && (
          <div className="mx-6 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar plantilla
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  onSetDefault,
}: {
  template: AuditTemplate;
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}) {
  const MAX_TYPES = 3;
  const visibleTypes = template.auditTypes.slice(0, MAX_TYPES);
  const extraCount   = template.auditTypes.length - MAX_TYPES;

  const typeLabels = AUDIT_TYPES.reduce<Record<string, string>>((acc, t) => {
    acc[t.value] = t.label;
    return acc;
  }, {});

  const sectionCount = template.sections?.length ?? 0;

  return (
    <div
      className={cn(
        'rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md',
        template.isDefault ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="truncate text-sm font-semibold text-slate-800">{template.name}</h3>
            {template.isDefault && (
              <span className="shrink-0 flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                <Star className="h-2.5 w-2.5" /> Predeterminada
              </span>
            )}
            {template.isSystem && (
              <span className="shrink-0 flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                <Lock className="h-2.5 w-2.5" /> Sistema
              </span>
            )}
          </div>
          {template.description && (
            <p className="mt-0.5 truncate text-xs text-slate-500">{template.description}</p>
          )}
        </div>
      </div>

      {/* Audit types */}
      <div className="mt-3 flex flex-wrap gap-1">
        {visibleTypes.map((t) => (
          <span
            key={t}
            className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600"
          >
            {typeLabels[t] ?? t}
          </span>
        ))}
        {extraCount > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
            +{extraCount} más
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
        <span>{template.papers.length} {template.papers.length === 1 ? 'papel' : 'papeles'}</span>
        {sectionCount > 0 && (
          <>
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1">
              <FolderOpen className="h-3 w-3 text-amber-500" />
              {sectionCount} carpeta{sectionCount !== 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onView}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 font-medium"
        >
          <Eye className="h-3 w-3" /> Ver
        </button>
        {!template.isDefault && (
          <button
            type="button"
            onClick={onSetDefault}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
          >
            <Star className="h-3 w-3" /> Predeterminar
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
        >
          <Pencil className="h-3 w-3" /> Editar
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
        >
          <Copy className="h-3 w-3" /> Duplicar
        </button>
        {!template.isSystem && !template.isDefault && (
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-red-500 hover:bg-red-50"
          >
            <Trash2 className="h-3 w-3" /> Eliminar
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; template: AuditTemplate }
  | { mode: 'view'; template: AuditTemplate }
  | null;

export default function AuditTemplatesPage() {
  const [filterType, setFilterType] = useState('');
  const { data: templates, isLoading } = useAuditTemplates(filterType || undefined);

  const createTemplate    = useCreateAuditTemplate();
  const updateTemplate    = useUpdateAuditTemplate();
  const deleteTemplate    = useDeleteAuditTemplate();
  const duplicateTemplate = useDuplicateAuditTemplate();
  const setDefault        = useSetDefaultAuditTemplate();
  const reseedSystem      = useReseedSystemTemplates();

  const [modal, setModal] = useState<ModalState>(null);

  const handleSave = async (data: CreateAuditTemplateData) => {
    if (modal?.mode === 'edit') {
      await updateTemplate.mutateAsync({ id: modal.template.id, data });
    } else {
      await createTemplate.mutateAsync(data);
    }
  };

  const handleDelete = (tpl: AuditTemplate) => {
    if (!confirm(`¿Eliminar la plantilla "${tpl.name}"?`)) return;
    deleteTemplate.mutate(tpl.id);
  };

  const handleDuplicate = (tpl: AuditTemplate) => {
    duplicateTemplate.mutate(tpl.id);
  };

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Plantillas de Auditoría"
        breadcrumbs={[
          { label: 'Administración' },
          { label: 'Plantillas de Auditoría' },
        ]}
      />

      {/* Sub-header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3 gap-4 flex-wrap">
        <p className="text-sm text-slate-500">
          Define carpetas y papeles de trabajo que se crean automáticamente al iniciar cada tipo de auditoría
        </p>
        <div className="flex items-center gap-3">
          {/* Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Todos los tipos</option>
            {AUDIT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={reseedSystem.isPending}
            onClick={() => {
              reseedSystem.mutate(undefined, {
                onSuccess: (result) => {
                  alert(`Plantillas restauradas: ${result.updated} actualizadas, ${result.created} creadas.`);
                },
              });
            }}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title="Actualiza las plantillas de sistema con el catálogo de papeles más reciente"
          >
            {reseedSystem.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
            Restaurar plantillas
          </button>
          <button
            type="button"
            onClick={() => setModal({ mode: 'create' })}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Nueva Plantilla
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : !templates?.length ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <ClipboardList className="h-8 w-8 text-slate-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-700">Sin plantillas</p>
              <p className="mt-1 text-sm text-slate-500">
                {filterType
                  ? 'No hay plantillas para este tipo. Prueba con otro filtro o crea una nueva.'
                  : 'Crea tu primera plantilla de auditoría para definir carpetas y papeles de trabajo estándar.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onView={() => setModal({ mode: 'view', template: tpl })}
                onEdit={() => setModal({ mode: 'edit', template: tpl })}
                onDuplicate={() => handleDuplicate(tpl)}
                onDelete={() => handleDelete(tpl)}
                onSetDefault={() => setDefault.mutate(tpl.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* View modal (read-only) */}
      {modal?.mode === 'view' && (
        <TemplateViewModal
          template={modal.template}
          onClose={() => setModal(null)}
        />
      )}

      {/* Editor modal (create / edit) */}
      {(modal?.mode === 'create' || modal?.mode === 'edit') && (
        <TemplateEditorModal
          mode={modal.mode}
          initial={modal.mode === 'edit' ? modal.template : undefined}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
