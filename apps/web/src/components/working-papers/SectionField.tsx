'use client';

import { useState, useEffect } from 'react';
import { Pencil, Bot, X, Check, Sparkles, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { MentionItem, PaperSection, SectionFieldType } from '@/hooks/useWorkingPaperGraph';
import { useAssistSection, useConfirmSection } from '@/hooks/useWorkingPaperGraph';
import { HighlightedMentions, MentionableTextarea } from './MentionableTextarea';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayValue(value: unknown, fieldType: SectionFieldType): string {
  if (value === null || value === undefined || value === '') return '';
  switch (fieldType) {
    case 'BOOLEAN':
      return value ? 'Sí' : 'No';
    case 'CURRENCY':
      return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Number(value));
    case 'PERCENTAGE':
      return `${value}%`;
    case 'DATE':
      return new Intl.DateTimeFormat('es-CL').format(new Date(String(value)));
    default:
      return String(value);
  }
}

// ─── Matrix display ───────────────────────────────────────────────────────────

function MatrixDisplay({ value }: { value: unknown }) {
  let data: Record<string, unknown>[] = [];
  try {
    data = Array.isArray(value) ? (value as Record<string, unknown>[]) : JSON.parse(String(value));
  } catch {
    return <p className="text-xs text-gray-400 italic">Datos de matriz inválidos</p>;
  }
  if (!data.length) return <p className="text-xs text-gray-400 italic">Sin datos</p>;

  const cols = Object.keys(data[0]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-gray-50">
            {cols.map(col => (
              <th key={col} className="px-3 py-2 text-left font-semibold text-gray-600 border-b border-gray-200">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 last:border-0">
              {cols.map(col => (
                <td key={col} className="px-3 py-2 text-gray-700">
                  {String(row[col] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Reference badge ──────────────────────────────────────────────────────────

function ReferenceBadge({ value }: { value: unknown }) {
  const refs = Array.isArray(value) ? value : [value];
  return (
    <div className="flex flex-wrap gap-1.5">
      {refs.filter(Boolean).map((r, i) => (
        <span
          key={i}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-indigo-50 border border-indigo-200 text-indigo-700"
        >
          {String(r)}
        </span>
      ))}
      {refs.filter(Boolean).length === 0 && (
        <span className="text-xs text-gray-400 italic">Sin referencia</span>
      )}
    </div>
  );
}

// ─── AI Draft config ─────────────────────────────────────────────────────────

export interface AiDraftConfig {
  agentId:      string;
  agentName:    string;
  agentColor:   string;
  paperContext: Record<string, unknown>;
}

// ─── Section AI Draft panel ───────────────────────────────────────────────────

function SectionAiDraft({
  paperId,
  section,
  config,
  onApply,
  onClose,
}: {
  paperId:  string;
  section:  PaperSection;
  config:   AiDraftConfig;
  onApply:  (value: string) => void;
  onClose:  () => void;
}) {
  const [draft,      setDraft]      = useState<string | null>(null);
  const [usedAI,     setUsedAI]     = useState(false);
  const [error,      setError]      = useState('');
  const [userPrompt, setUserPrompt] = useState('');

  const assist = useAssistSection();

  useEffect(() => { fetchDraft(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchDraft(extraPrompt: string) {
    setError('');
    setDraft(null);
    try {
      const res = await assist.mutateAsync({
        paperId,
        sectionKey: section.sectionKey,
        userPrompt: extraPrompt || undefined,
      });
      setDraft(res.suggestion);
      setUsedAI(res.usedAI);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Error al generar borrador');
    }
  }

  const loading = assist.isPending;

  return (
    <div className="mt-2 bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold ${config.agentColor}`}>
            {config.agentName.charAt(0)}
          </div>
          <span className="text-[11px] font-semibold text-violet-700">
            {config.agentName} · Borrador IA
          </span>
          {!usedAI && draft && (
            <span className="text-[10px] text-amber-600 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full">
              Fallback (sin IA)
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-violet-200 text-violet-400">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Loading dots */}
      {loading && (
        <div className="flex items-center gap-2 py-1">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>
          <span className="text-[11px] text-violet-500">Generando borrador con contexto…</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <p className="text-[11px] text-red-500 bg-red-50 rounded-lg px-2 py-1">{error}</p>
      )}

      {/* Draft preview */}
      {draft && !loading && (
        <>
          <div className="bg-white border border-violet-200 rounded-lg px-3 py-2 max-h-56 overflow-y-auto">
            <p className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap">{draft}</p>
          </div>

          {/* User refinement prompt */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={userPrompt}
              onChange={e => setUserPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') fetchDraft(userPrompt); }}
              placeholder="Refinar: ej. 'más enfoque en NIA 315', 'más conciso'..."
              className="flex-1 text-[11px] border border-violet-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
            />
            <button
              onClick={() => fetchDraft(userPrompt)}
              disabled={loading}
              className="px-2 py-1 bg-violet-100 text-violet-700 text-[11px] font-medium rounded-lg hover:bg-violet-200 disabled:opacity-50"
            >
              Refinar
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { onApply(draft); onClose(); }}
              className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 text-white text-[11px] font-semibold rounded-lg hover:bg-violet-700 transition-colors"
            >
              <Check className="w-3 h-3" /> Aplicar
            </button>
            <button
              onClick={() => fetchDraft('')}
              className="flex items-center gap-1 px-3 py-1.5 border border-violet-200 text-violet-600 text-[11px] font-medium rounded-lg hover:bg-violet-100 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Regenerar
            </button>
            <button
              onClick={onClose}
              className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1.5 transition-colors"
            >
              Descartar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Editable input ───────────────────────────────────────────────────────────

interface EditInputProps {
  section:      PaperSection;
  value:        unknown;
  onChange:     (v: unknown) => void;
  onBlur:       () => void;
  paperId?:     string;
  mentionItems?: MentionItem[];
  onMentionSelect?: (targetPaperId: string, targetSectionKey?: string) => void;
}

function EditInput({ section, value, onChange, onBlur, mentionItems, onMentionSelect }: EditInputProps) {
  const baseInput =
    'w-full text-sm border border-blue-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

  switch (section.fieldType) {
    case 'TEXTAREA':
      return (
        <MentionableTextarea
          multiline
          rows={4}
          value={String(value ?? '')}
          onChange={v => onChange(v)}
          onBlur={onBlur}
          mentionItems={mentionItems}
          onMentionSelect={onMentionSelect}
        />
      );

    case 'BOOLEAN':
      return (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { onChange(true); onBlur(); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              value === true
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'
            }`}
          >
            Sí
          </button>
          <button
            type="button"
            onClick={() => { onChange(false); onBlur(); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              value === false
                ? 'bg-red-500 text-white border-red-500'
                : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
            }`}
          >
            No
          </button>
        </div>
      );

    case 'ENUM_SELECT':
      return (
        <select
          autoFocus
          className={baseInput}
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
        >
          <option value="">— Seleccionar —</option>
          {(section.options ?? []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'DATE':
      return (
        <input
          autoFocus
          type="date"
          className={baseInput}
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
        />
      );

    case 'NUMBER':
    case 'CURRENCY':
    case 'PERCENTAGE':
      return (
        <div className="flex items-center gap-2">
          {section.fieldType === 'CURRENCY' && (
            <span className="text-sm text-gray-500 shrink-0">$</span>
          )}
          <input
            autoFocus
            type="number"
            className={baseInput}
            value={String(value ?? '')}
            onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            onBlur={onBlur}
          />
          {section.fieldType === 'PERCENTAGE' && (
            <span className="text-sm text-gray-500 shrink-0">%</span>
          )}
        </div>
      );

    default: // TEXT
      return (
        <MentionableTextarea
          multiline={false}
          value={String(value ?? '')}
          onChange={v => onChange(v)}
          onBlur={onBlur}
          mentionItems={mentionItems}
          onMentionSelect={onMentionSelect}
        />
      );
  }
}

// ─── Main SectionField component ─────────────────────────────────────────────

export interface SectionFieldProps {
  section:          PaperSection;
  readonly?:        boolean;
  onSave:           (sectionKey: string, value: unknown) => void;
  paperId?:         string;
  mentionItems?:    MentionItem[];
  onMentionSelect?: (sectionKey: string, targetPaperId: string, targetSectionKey?: string) => void;
  aiDraftConfig?:   AiDraftConfig;
}

export function SectionField({ section, readonly = false, onSave, paperId, mentionItems, onMentionSelect, aiDraftConfig }: SectionFieldProps) {
  const [editing,      setEditing]   = useState(false);
  const [localValue,   setLocal]     = useState<unknown>(section.value);
  const [overriding,   setOverride]  = useState(false);
  const [showAiDraft,  setAiDraft]   = useState(false);

  const confirmSection = useConfirmSection();

  // PI.2 — section is stale (a source paper changed after this was filled)
  const isStale = !!section.isStale;

  // PI.3 — AI draft is available for any text-like field as long as we have paperId
  const canAiDraft =
    !!paperId &&
    !readonly &&
    (section.fieldType === 'TEXT' || section.fieldType === 'TEXTAREA');

  // Use provided aiDraftConfig OR a sensible default for the new endpoint
  const effectiveAiConfig: AiDraftConfig = aiDraftConfig ?? {
    agentId:      'scriptorium',
    agentName:    'Scriptorium',
    agentColor:   'bg-violet-500',
    paperContext: {},
  };

  // Keep local value in sync with incoming section value
  const effectiveValue = editing ? localValue : section.value;

  const isReadOnlyField =
    readonly ||
    section.fieldType === 'MATRIX' ||
    section.fieldType === 'REFERENCE' ||
    section.fieldType === 'RISK_REF' ||
    section.fieldType === 'ATTACHMENT';

  const isAutoAndLocked = section.isAutoFilled && !overriding && !editing;

  function startEdit() {
    if (isReadOnlyField) return;
    if (section.isAutoFilled && !overriding) {
      setOverride(true);
    }
    setLocal(section.value);
    setEditing(true);
  }

  function handleBlur() {
    setEditing(false);
    onSave(section.sectionKey, localValue);
  }

  function handleCancelOverride() {
    setEditing(false);
    setOverride(false);
  }

  // Auto-filled / stale wrapper styles
  const autoFilledWrap = isStale
    ? 'bg-orange-50 border border-orange-300 rounded-xl p-3 ring-1 ring-orange-200'
    : section.isAutoFilled
      ? 'bg-amber-50 border border-amber-200 rounded-xl p-3'
      : '';

  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      {/* Label row */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {section.label}
            {section.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </p>
          {section.isAutoFilled && (
            <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full">
              <Bot className="w-2.5 h-2.5" />
              de: {section.sourceRef ?? 'IA'}
            </span>
          )}
          {isStale && (
            <span
              className="flex items-center gap-1 text-[10px] text-orange-700 bg-orange-100 border border-orange-300 px-1.5 py-0.5 rounded-full"
              title={section.staleReason ?? 'Una fuente cambió'}
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              Desactualizado
            </span>
          )}
        </div>

        {/* AI Draft button — text/textarea fields only */}
        {canAiDraft && !editing && (
          <button
            onClick={() => setAiDraft(p => !p)}
            className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border transition-colors ${
              showAiDraft
                ? 'bg-violet-100 text-violet-700 border-violet-300'
                : 'bg-violet-50 text-violet-600 border-violet-200 hover:bg-violet-100'
            }`}
            title="Generar borrador con IA"
          >
            <Sparkles className="w-3 h-3" />
            Borrador
          </button>
        )}

        {/* Edit toggle */}
        {!isReadOnlyField && !editing && (
          <button
            onClick={startEdit}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
            title="Editar"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {editing && overriding && (
          <button
            onClick={handleCancelOverride}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title="Cancelar edición"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {editing && !overriding && (
          <button
            onClick={handleBlur}
            className="flex items-center gap-1 text-xs text-emerald-600 font-medium"
          >
            <Check className="w-3.5 h-3.5" /> Listo
          </button>
        )}
      </div>

      {section.description && (
        <p className="text-[11px] text-gray-400 mb-2">{section.description}</p>
      )}

      {section.aiHint && !editing && !isStale && (
        <p className="text-[11px] text-violet-500 italic mb-2">
          Sugerencia IA: {section.aiHint}
        </p>
      )}

      {/* PI.2 — Stale banner with reason + confirm button */}
      {isStale && !readonly && paperId && (
        <div className="mb-2 flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-orange-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-orange-800 font-medium">
              {section.staleReason ?? 'Una fuente cambió después de redactar esta sección.'}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => confirmSection.mutate({ paperId, sectionKey: section.sectionKey })}
                disabled={confirmSection.isPending}
                className="flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full hover:bg-emerald-100 disabled:opacity-50"
                title="El valor actual sigue siendo correcto"
              >
                <ShieldCheck className="w-2.5 h-2.5" />
                Confirmar vigencia
              </button>
              {canAiDraft && (
                <button
                  onClick={() => setAiDraft(true)}
                  className="flex items-center gap-1 text-[10px] text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full hover:bg-violet-100"
                  title="Regenerar con IA usando el contexto actualizado"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  Regenerar con IA
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Value display / edit */}
      <div className={`group relative ${autoFilledWrap}`}>
        {/* Overlay edit button for auto-filled fields */}
        {section.isAutoFilled && !editing && !readonly && (
          <button
            onClick={startEdit}
            className="absolute top-1 right-1 p-1 rounded hover:bg-amber-200 text-amber-500 hover:text-amber-700 transition-colors z-10"
            title="Editar manualmente (sobrescribir valor de IA)"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}

        {editing ? (
          <EditInput
            section={section}
            value={localValue}
            onChange={setLocal}
            onBlur={handleBlur}
            paperId={paperId}
            mentionItems={mentionItems}
            onMentionSelect={(targetPaperId, targetSectionKey) =>
              onMentionSelect?.(section.sectionKey, targetPaperId, targetSectionKey)
            }
          />
        ) : (
          <div
            onClick={isReadOnlyField || isAutoAndLocked ? undefined : startEdit}
            className={!isReadOnlyField && !isAutoAndLocked ? 'cursor-text hover:bg-gray-50 rounded-lg p-1.5 -mx-1.5 transition-colors' : ''}
          >
            {/* Matrix */}
            {section.fieldType === 'MATRIX' && (
              <MatrixDisplay value={effectiveValue} />
            )}

            {/* Reference / Risk ref */}
            {(section.fieldType === 'REFERENCE' || section.fieldType === 'RISK_REF') && (
              <ReferenceBadge value={effectiveValue} />
            )}

            {/* Attachment */}
            {section.fieldType === 'ATTACHMENT' && (
              <p className="text-xs text-gray-500 italic">
                {effectiveValue ? String(effectiveValue) : 'Sin adjunto'}
              </p>
            )}

            {/* Boolean */}
            {section.fieldType === 'BOOLEAN' && effectiveValue !== null && effectiveValue !== undefined && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                effectiveValue ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
              }`}>
                {effectiveValue ? 'Sí' : 'No'}
              </span>
            )}

            {/* All text-like */}
            {!['MATRIX', 'REFERENCE', 'RISK_REF', 'ATTACHMENT', 'BOOLEAN'].includes(section.fieldType) && (
              <p className={`text-sm leading-relaxed ${
                effectiveValue !== null && effectiveValue !== undefined && effectiveValue !== ''
                  ? 'text-gray-700'
                  : 'text-gray-400 italic'
              }`}>
                {effectiveValue !== null && effectiveValue !== undefined && effectiveValue !== ''
                  ? (
                    // Highlight @[mention] tokens in TEXT / TEXTAREA fields
                    (section.fieldType === 'TEXT' || section.fieldType === 'TEXTAREA') &&
                    String(effectiveValue).includes('@[')
                      ? <HighlightedMentions text={displayValue(effectiveValue, section.fieldType)} />
                      : displayValue(effectiveValue, section.fieldType)
                  )
                  : section.description
                    ? 'Sin valor — haz clic para editar'
                    : 'Haz clic para editar'}
              </p>
            )}

            {/* Boolean empty state */}
            {section.fieldType === 'BOOLEAN' && (effectiveValue === null || effectiveValue === undefined) && (
              <p className="text-sm text-gray-400 italic">Sin selección</p>
            )}
          </div>
        )}
      </div>

      {/* AI Draft panel — shown below field when active */}
      {showAiDraft && canAiDraft && paperId && (
        <SectionAiDraft
          paperId={paperId}
          section={section}
          config={effectiveAiConfig}
          onApply={(value) => {
            onSave(section.sectionKey, value);
            setLocal(value);
            setAiDraft(false);
          }}
          onClose={() => setAiDraft(false)}
        />
      )}
    </div>
  );
}
