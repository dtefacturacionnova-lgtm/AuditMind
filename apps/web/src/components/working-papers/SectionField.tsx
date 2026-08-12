'use client';

import { useState, useEffect, useRef } from 'react';
import { Pencil, Bot, X, Check, Sparkles, RefreshCw, AlertTriangle, ShieldCheck, Paperclip, Upload, Trash2, FileText, Loader2 } from 'lucide-react';
import type { MentionItem, PaperSection, SectionAttachment, SectionFieldType } from '@/hooks/useWorkingPaperGraph';
import { useAssistSection, useConfirmSection, useAttachToSection, useRemoveSectionAttachment } from '@/hooks/useWorkingPaperGraph';
import { HighlightedMentions, MentionableTextarea } from './MentionableTextarea';
import { AccountScheduleSection } from './AccountScheduleSection';
import type { AccountScheduleRow } from './AccountScheduleSection';
import { DeclaracionesIndependenciaPanel } from './DeclaracionesIndependenciaPanel';
import type { DeclaracionRow } from './DeclaracionesIndependenciaPanel';
import { MarcoLegalNormativaPanel } from './MarcoLegalNormativaPanel';
import type { NormativaRow } from './MarcoLegalNormativaPanel';
import { InformesAuditoriaInternaPanel } from './InformesAuditoriaInternaPanel';
import type { InformeAIRow } from './InformesAuditoriaInternaPanel';
import { ChecklistPanel } from './ChecklistPanel';
import type { ChecklistValue } from './ChecklistPanel';
import { ComunicacionAIPanel } from './ComunicacionAIPanel';
import type { ComunicacionRow } from './ComunicacionAIPanel';
import { ProcedureGridPanel } from './ProcedureGridPanel';
import { MatrixGridPanel } from './MatrixGridPanel';

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
    const parsed = Array.isArray(value) ? value : JSON.parse(String(value));
    data = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
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

// ─── Section attachments (support documents) ───────────────────────────────────

function formatBytes(n?: number): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function SectionAttachments({
  paperId,
  sectionKey,
  attachments,
  readonly,
}: {
  paperId: string;
  sectionKey: string;
  attachments: SectionAttachment[];
  readonly: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const attach = useAttachToSection();
  const remove = useRemoveSectionAttachment();
  const [open, setOpen] = useState(attachments.length > 0);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    attach.mutate({ paperId, sectionKey, file });
    if (fileRef.current) fileRef.current.value = '';
  }

  if (readonly && attachments.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 transition-colors"
      >
        <Paperclip className="w-3 h-3" />
        Documentos de soporte
        {attachments.length > 0 && (
          <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium">
            {attachments.length}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-1.5 space-y-1">
          {attachments.map(att => (
            <div
              key={att.id}
              className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 truncate text-[11px] text-blue-600 hover:underline"
                title={att.filename}
              >
                {att.filename}
              </a>
              {att.size ? <span className="text-[10px] text-gray-400 shrink-0">{formatBytes(att.size)}</span> : null}
              {!readonly && (
                <button
                  onClick={() => remove.mutate({ paperId, sectionKey, attachmentId: att.id })}
                  disabled={remove.isPending}
                  className="p-0.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 shrink-0"
                  title="Quitar adjunto"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}

          {!readonly && (
            <>
              <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={attach.isPending}
                className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 hover:border-gray-400 rounded-lg px-2 py-1.5 w-full justify-center transition-colors disabled:opacity-50"
              >
                {attach.isPending ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> Subiendo…
                  </>
                ) : (
                  <>
                    <Upload className="w-3 h-3" /> Adjuntar documento
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
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
    section.fieldType === 'ATTACHMENT' ||
    section.fieldType === 'DECLARATIONS' ||
    section.fieldType === 'LEGAL_MATRIX' ||
    section.fieldType === 'AUDIT_REPORTS' ||
    section.fieldType === 'CHECKLIST' ||
    section.fieldType === 'COMMUNICATION_LOG' ||
    section.fieldType === 'PROCEDURE_GRID';

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
            {/* Account Schedule — analítica multi-nivel */}
            {section.fieldType === 'ACCOUNT_SCHEDULE' && paperId && (
              <AccountScheduleSection
                paperId={paperId}
                rows={
                  Array.isArray(effectiveValue)
                    ? (effectiveValue as AccountScheduleRow[])
                    : (() => {
                        try { return JSON.parse(String(effectiveValue ?? '[]')); }
                        catch { return []; }
                      })()
                }
                onChange={rows => onSave(section.sectionKey, rows as unknown as string)}
                readOnly={readonly}
              />
            )}

            {/* Declarations — grid de declaraciones de independencia con adjunto por fila */}
            {section.fieldType === 'DECLARATIONS' && paperId && (
              <DeclaracionesIndependenciaPanel
                paperId={paperId}
                rows={
                  Array.isArray(effectiveValue)
                    ? (effectiveValue as DeclaracionRow[])
                    : (() => {
                        try { return JSON.parse(String(effectiveValue ?? '[]')); }
                        catch { return []; }
                      })()
                }
                onChange={rows => onSave(section.sectionKey, rows as unknown as string)}
                readOnly={readonly}
              />
            )}

            {/* Legal Matrix — grid de normativas con columnas especializadas + adjunto por fila */}
            {section.fieldType === 'LEGAL_MATRIX' && paperId && (
              <MarcoLegalNormativaPanel
                paperId={paperId}
                rows={
                  Array.isArray(effectiveValue)
                    ? (effectiveValue as NormativaRow[])
                    : (() => {
                        try { return JSON.parse(String(effectiveValue ?? '[]')); }
                        catch { return []; }
                      })()
                }
                onChange={rows => onSave(section.sectionKey, rows as unknown as string)}
                readOnly={readonly}
              />
            )}

            {/* Audit Reports — grid de informes de auditoría interna emitidos + adjunto por fila */}
            {section.fieldType === 'AUDIT_REPORTS' && paperId && (
              <InformesAuditoriaInternaPanel
                paperId={paperId}
                rows={
                  Array.isArray(effectiveValue)
                    ? (effectiveValue as InformeAIRow[])
                    : (() => {
                        try { return JSON.parse(String(effectiveValue ?? '[]')); }
                        catch { return []; }
                      })()
                }
                onChange={rows => onSave(section.sectionKey, rows as unknown as string)}
                readOnly={readonly}
              />
            )}

            {/* Checklist — tabla interactiva Sí/No/N/A por criterio + conclusión + fundamento */}
            {section.fieldType === 'CHECKLIST' && (
              <ChecklistPanel
                options={section.options ?? []}
                value={(() => {
                  try {
                    const parsed = typeof effectiveValue === 'string'
                      ? JSON.parse(effectiveValue)
                      : effectiveValue;
                    return parsed && typeof parsed === 'object' && 'items' in parsed
                      ? (parsed as ChecklistValue)
                      : null;
                  } catch { return null; }
                })()}
                onChange={v => onSave(section.sectionKey, JSON.stringify(v))}
                readOnly={readonly}
              />
            )}

            {/* Procedure Grid — grid jerárquico 2 niveles: Procedimiento → Actividad (NIA 230/330) */}
            {section.fieldType === 'PROCEDURE_GRID' && section.id && (
              <ProcedureGridPanel
                sectionId={section.id}
                readOnly={readonly}
              />
            )}

            {/* Communication Log — grid de comunicaciones con AI + adjunto por fila */}
            {section.fieldType === 'COMMUNICATION_LOG' && paperId && (
              <ComunicacionAIPanel
                paperId={paperId}
                rows={
                  Array.isArray(effectiveValue)
                    ? (effectiveValue as ComunicacionRow[])
                    : (() => {
                        try { return JSON.parse(String(effectiveValue ?? '[]')); }
                        catch { return []; }
                      })()
                }
                onChange={rows => onSave(section.sectionKey, rows as unknown as string)}
                readOnly={readonly}
              />
            )}

            {/* Matrix — grid editable genérico (columnas dinámicas por sección) */}
            {section.fieldType === 'MATRIX' && (
              paperId ? (
                <MatrixGridPanel
                  value={effectiveValue}
                  onChange={rows => onSave(section.sectionKey, rows)}
                  paperId={paperId}
                  sectionKey={section.sectionKey}
                  aiHint={section.aiHint}
                  readOnly={readonly}
                />
              ) : (
                <MatrixDisplay value={effectiveValue} />
              )
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
            {!['MATRIX', 'REFERENCE', 'RISK_REF', 'ATTACHMENT', 'BOOLEAN', 'ACCOUNT_SCHEDULE', 'DECLARATIONS', 'LEGAL_MATRIX', 'AUDIT_REPORTS', 'CHECKLIST', 'COMMUNICATION_LOG', 'PROCEDURE_GRID'].includes(section.fieldType) && (
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

      {/* Documentos de soporte de la sección — consistente con procedimientos */}
      {paperId && !editing && (
        <SectionAttachments
          paperId={paperId}
          sectionKey={section.sectionKey}
          attachments={section.attachments ?? []}
          readonly={readonly}
        />
      )}
    </div>
  );
}
