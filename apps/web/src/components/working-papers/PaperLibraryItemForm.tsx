'use client';

import { useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import {
  AUDIT_TYPE_LABEL, PRIORITY_LABEL, TECHNIQUES,
  type LibraryItemInput, type LibraryPriority, type Technique,
} from '@/hooks/usePaperLibrary';

// Mismos límites que el servidor (org-library.ts → validateOrgProcedure); el servidor es quien decide, esto solo evita idas y vueltas.
const LIMITS = { title: [8, 90], statement: [30, 600], development: [80, 1500] } as const;

function Counter({ value, min, max }: { value: string; min: number; max: number }) {
  const n = value.trim().length;
  const bad = n > 0 && (n < min || n > max);
  return <span className={`text-[10px] ${bad ? 'text-red-600' : 'text-gray-400'}`}>{n}/{max} (mín. {min})</span>;
}

const field = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300';
const label = 'text-[10px] font-semibold uppercase text-gray-500';

/**
 * Formulario de un procedimiento de la biblioteca. Lo usan la pantalla de administración (crear / editar / ajustar uno del sistema)
 * y el botón «Guardar en la biblioteca» del papel. `showAuditTypes` solo en administración.
 */
export function PaperLibraryItemForm({
  initial, submitLabel, saving, error, showAuditTypes = true, hint, onSubmit, onCancel,
}: {
  initial?: Partial<LibraryItemInput>;
  submitLabel: string;
  saving: boolean;
  error?: string | null;
  showAuditTypes?: boolean;
  hint?: string;
  onSubmit: (data: LibraryItemInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [statement, setStatement] = useState(initial?.statement ?? '');
  const [development, setDevelopment] = useState(initial?.development ?? '');
  const [technique, setTechnique] = useState<Technique>(initial?.technique ?? 'Inspección');
  const [priority, setPriority] = useState<LibraryPriority>(initial?.priority ?? 'MEDIUM');
  const [ref, setRef] = useState(initial?.ref ?? '');
  const [types, setTypes] = useState<string[]>(initial?.auditTypes ?? []);

  const ok = (v: string, [min, max]: readonly [number, number]) => v.trim().length >= min && v.trim().length <= max;
  const valid = ok(title, LIMITS.title) && ok(statement, LIMITS.statement) && ok(development, LIMITS.development) && ref.trim().length <= 60;

  function submit() {
    onSubmit({
      title: title.trim(), statement: statement.trim(), development: development.trim(), technique, priority,
      ref: ref.trim() || undefined,
      auditTypes: types.length > 0 ? types : undefined,
    });
  }

  return (
    <div className="space-y-3">
      {hint && <p className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs text-violet-800">{hint}</p>}

      <div>
        <div className="flex items-center justify-between"><label className={label}>Título</label><Counter value={title} min={LIMITS.title[0]} max={LIMITS.title[1]} /></div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="Título corto del procedimiento" />
      </div>
      <div>
        <div className="flex items-center justify-between"><label className={label}>Enunciado (qué se hace)</label><Counter value={statement} min={LIMITS.statement[0]} max={LIMITS.statement[1]} /></div>
        <textarea value={statement} onChange={(e) => setStatement(e.target.value)} rows={3} className={field} placeholder="Qué se va a ejecutar" />
      </div>
      <div>
        <div className="flex items-center justify-between"><label className={label}>Desarrollo modelo</label><Counter value={development} min={LIMITS.development[0]} max={LIMITS.development[1]} /></div>
        <textarea value={development} onChange={(e) => setDevelopment(e.target.value)} rows={6} className={field}
          placeholder="Cómo se ejecuta. Deja entre [corchetes] lo que cada auditor completa: [completar: fuente consultada], [completar: resultado]…" />
        <p className="mt-0.5 text-[10px] text-gray-400">Sin cifras ni resultados de un encargo concreto: usa [completar: …] para que sirva de plantilla.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={label}>Técnica</label>
          <select value={technique} onChange={(e) => setTechnique(e.target.value as Technique)} className={field}>
            {TECHNIQUES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Prioridad</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as LibraryPriority)} className={field}>
            {(Object.keys(PRIORITY_LABEL) as LibraryPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Referencia (opcional)</label>
          <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} className={field} placeholder="Ej. NIA 550" />
        </div>
      </div>

      {showAuditTypes && (
        <div>
          <label className={label}>Aplica a estos tipos de encargo</label>
          <p className="mb-1 text-[10px] text-gray-400">Sin marcar = todos. Útil cuando un mismo papel se usa en varios marcos.</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(AUDIT_TYPE_LABEL).map(([k, v]) => {
              const on = types.includes(k);
              return (
                <button key={k} type="button" aria-pressed={on}
                  onClick={() => setTypes((cur) => (on ? cur.filter((x) => x !== k) : [...cur, k]))}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${on ? 'border-violet-300 bg-violet-100 text-violet-800' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}>
                  {v}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button type="button" onClick={submit} disabled={!valid || saving}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"><X className="h-3 w-3" /> Cancelar</button>
      </div>
    </div>
  );
}

/** Mensaje legible de un error del servidor (Nest devuelve el texto en `message`; apiClient lo lanza como Error). */
export function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'No se pudo guardar. Intenta de nuevo.';
}
