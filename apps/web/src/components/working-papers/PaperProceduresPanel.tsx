'use client';

import { useState } from 'react';
import {
  ListChecks, Trash2, Loader2, Plus, Sparkles, Wand2, Save, X, Pencil, ChevronDown, ChevronRight,
} from 'lucide-react';
import {
  useRemoveProcedure, useAppendProcedure, useUpdateProcedure,
  useImproveText, useDraftProcedure,
} from '@/hooks/useWorkingPaperGraph';

export interface AppliedProcedure {
  id:          string;
  title?:      string;
  statement?:  string;
  development?: string;
  procedure?:  string;   // legacy
  area:        string;
  niaRef?:     string;
  addedAt:     string;
}

interface PaperProceduresPanelProps {
  paperId:    string;
  paperTitle?: string;
  paperType?: string;
  paperCode?: string | null;
  procedures: AppliedProcedure[];
  readonly?:  boolean;
}

// ─── AI-enhanced textarea ─────────────────────────────────────────────────────

function AiTextarea({
  value, onChange, placeholder, rows = 2, fieldType, paperTitle, paperType, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  fieldType: 'title' | 'statement' | 'development';
  paperTitle?: string;
  paperType?: string;
  disabled?: boolean;
}) {
  const improve = useImproveText();

  async function handleImprove() {
    if (!value.trim()) return;
    try {
      const res = await improve.mutateAsync({ text: value, fieldType, paperTitle, paperType });
      if (res.improved) onChange(res.improved);
    } catch { /* ignore */ }
  }

  return (
    <div className="relative">
      {fieldType === 'title' ? (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full text-sm font-semibold border border-gray-200 rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      ) : (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-y"
        />
      )}
      <button
        type="button"
        onClick={handleImprove}
        disabled={disabled || improve.isPending || !value.trim()}
        title="Mejorar redacción con IA"
        className="absolute top-2 right-2 p-1 rounded-md text-violet-400 hover:text-violet-600 hover:bg-violet-50 disabled:opacity-40 transition-colors"
      >
        {improve.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ─── Procedure card (view + edit) ────────────────────────────────────────────

function ProcedureCard({
  paperId, proc, index, paperTitle, paperType, paperCode, readonly,
}: {
  paperId: string;
  proc: AppliedProcedure;
  index: number;
  paperTitle?: string;
  paperType?: string;
  paperCode?: string | null;
  readonly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen]       = useState(true);
  const [title, setTitle]     = useState(proc.title ?? proc.area ?? '');
  const [statement, setStatement] = useState(proc.statement ?? proc.procedure ?? '');
  const [development, setDevelopment] = useState(proc.development ?? '');

  const update  = useUpdateProcedure();
  const remove  = useRemoveProcedure();
  const draft   = useDraftProcedure();

  async function handleSave() {
    await update.mutateAsync({ paperId, procedureId: proc.id, title, statement, development });
    setEditing(false);
  }

  async function handleDraftDevelopment() {
    try {
      const res = await draft.mutateAsync({ title, statement, paperTitle, paperType, paperCode: paperCode ?? undefined });
      if (res.development) setDevelopment(res.development);
    } catch { /* ignore */ }
  }

  const displayTitle = proc.title ?? proc.area ?? 'Procedimiento';
  const displayStatement = proc.statement ?? proc.procedure ?? '';

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-start gap-3 p-3">
        <span className="shrink-0 w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center mt-0.5">
          {index + 1}
        </span>

        {editing ? (
          <div className="flex-1 space-y-2">
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase">Título</label>
              <AiTextarea value={title} onChange={setTitle} fieldType="title"
                placeholder="Título corto del procedimiento" paperTitle={paperTitle} paperType={paperType} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase">Enunciado (qué se hace)</label>
              <AiTextarea value={statement} onChange={setStatement} fieldType="statement" rows={2}
                placeholder="Describe el procedimiento a ejecutar" paperTitle={paperTitle} paperType={paperType} />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-gray-500 uppercase">Desarrollo (ejecución)</label>
                <button
                  type="button"
                  onClick={handleDraftDevelopment}
                  disabled={draft.isPending || (!title && !statement)}
                  className="flex items-center gap-1 text-[10px] font-medium text-violet-600 hover:text-violet-700 disabled:opacity-40"
                >
                  {draft.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Borrador IA
                </button>
              </div>
              <AiTextarea value={development} onChange={setDevelopment} fieldType="development" rows={4}
                placeholder="Cómo se ejecutó y qué se obtuvo" paperTitle={paperTitle} paperType={paperType} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={handleSave} disabled={update.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {update.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Guardar
              </button>
              <button onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 text-left w-full">
              {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
              <span className="text-sm font-bold text-gray-900">{displayTitle}</span>
              {proc.niaRef && (
                <span className="text-[10px] font-mono text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                  {proc.niaRef}
                </span>
              )}
            </button>
            {open && (
              <div className="mt-1.5 pl-5 space-y-2">
                <p className="text-sm text-gray-700 leading-relaxed">{displayStatement}</p>
                {proc.development ? (
                  <div className="bg-gray-50 border border-gray-100 rounded-lg p-2.5">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Desarrollo</p>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{proc.development}</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Sin desarrollo aún — edita para documentar la ejecución.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!readonly && !editing && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg text-gray-300 hover:text-violet-600 hover:bg-violet-50 transition-colors" title="Editar">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => remove.mutate({ paperId, procedureId: proc.id })} disabled={remove.isPending}
              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50" title="Quitar">
              {remove.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add free procedure form ──────────────────────────────────────────────────

function AddProcedureForm({
  paperId, paperTitle, paperType, paperCode, onDone,
}: {
  paperId: string; paperTitle?: string; paperType?: string; paperCode?: string | null; onDone: () => void;
}) {
  const [title, setTitle]         = useState('');
  const [statement, setStatement] = useState('');
  const [development, setDevelopment] = useState('');
  const append = useAppendProcedure();
  const draft  = useDraftProcedure();

  async function handleAdd() {
    if (!statement.trim() && !title.trim()) return;
    await append.mutateAsync({ paperId, title, statement, development, area: title || 'General' } as never);
    onDone();
  }

  async function handleDraft() {
    try {
      const res = await draft.mutateAsync({ title, statement, paperTitle, paperType, paperCode: paperCode ?? undefined });
      if (res.development) setDevelopment(res.development);
    } catch { /* ignore */ }
  }

  return (
    <div className="border-2 border-dashed border-violet-200 rounded-xl p-3 space-y-2 bg-violet-50/30">
      <div>
        <label className="text-[10px] font-semibold text-gray-500 uppercase">Título</label>
        <AiTextarea value={title} onChange={setTitle} fieldType="title"
          placeholder="Ej. Revisión de conciliaciones bancarias" paperTitle={paperTitle} paperType={paperType} />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-gray-500 uppercase">Enunciado</label>
        <AiTextarea value={statement} onChange={setStatement} fieldType="statement" rows={2}
          placeholder="Qué se va a ejecutar..." paperTitle={paperTitle} paperType={paperType} />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">Desarrollo (opcional)</label>
          <button type="button" onClick={handleDraft} disabled={draft.isPending || (!title && !statement)}
            className="flex items-center gap-1 text-[10px] font-medium text-violet-600 hover:text-violet-700 disabled:opacity-40">
            {draft.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Borrador IA
          </button>
        </div>
        <AiTextarea value={development} onChange={setDevelopment} fieldType="development" rows={3}
          placeholder="Cómo se ejecutó (puedes generarlo con IA)" paperTitle={paperTitle} paperType={paperType} />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={handleAdd} disabled={append.isPending || (!statement.trim() && !title.trim())}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50">
          {append.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Agregar procedimiento
        </button>
        <button onClick={onDone} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
      </div>
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function PaperProceduresPanel({
  paperId, paperTitle, paperType, paperCode, procedures, readonly = false,
}: PaperProceduresPanelProps) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-emerald-600" />
          <p className="text-sm font-semibold text-gray-800">
            Procedimientos del Papel
            <span className="ml-2 text-xs font-normal text-gray-400">({procedures.length})</span>
          </p>
        </div>
        {!readonly && !adding && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Agregar procedimiento
          </button>
        )}
      </div>

      <div className="p-4 space-y-2">
        {adding && (
          <AddProcedureForm
            paperId={paperId} paperTitle={paperTitle} paperType={paperType} paperCode={paperCode}
            onDone={() => setAdding(false)}
          />
        )}

        {procedures.length === 0 && !adding && (
          <p className="text-xs text-gray-400 text-center py-4">
            Sin procedimientos aún. Agrega uno libremente o aplica una sugerencia IA.
          </p>
        )}

        {procedures.map((p, i) => (
          <ProcedureCard
            key={p.id}
            paperId={paperId}
            proc={p}
            index={i}
            paperTitle={paperTitle}
            paperType={paperType}
            paperCode={paperCode}
            readonly={readonly}
          />
        ))}
      </div>
    </div>
  );
}
