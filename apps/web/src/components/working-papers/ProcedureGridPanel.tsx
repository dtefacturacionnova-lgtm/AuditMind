'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown, ChevronRight, Plus, Trash2, Save, X,
  CheckCircle2, Clock, AlertCircle, MinusCircle, Loader2,
  ShieldAlert, FileText,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type ProcStatus   = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'NA';
type StepStatus   = 'DRAFT' | 'IN_PROGRESS' | 'SUBMITTED' | 'REVIEWED' | 'CLEARED' | 'APPROVED';
type StepConclusion = 'PENDING' | 'NO_EXCEPTION' | 'EXCEPTION' | 'NA';
type TestType     = 'DETAIL' | 'ANALYTICAL' | 'CONTROL';
type AuditNature  = 'INSPECTION' | 'OBSERVATION' | 'INQUIRY' | 'CONFIRMATION' | 'RECALCULATION' | 'REPERFORMANCE' | 'ANALYTICAL';
type AuditTiming  = 'INTERIM' | 'YEAR_END' | 'ROLLFORWARD';

interface StepEvidence {
  id: string; fileName: string; storageKey: string; wpRef?: string;
  mimeType: string; size: number; uploadedAt: string;
}

interface AuditStep {
  id:               string;
  refNumber:        string;
  description:      string;
  assertions:       string[];
  testType:         TestType;
  nature:           AuditNature;
  timing:           AuditTiming;
  extent?:          string;
  population?:      string;
  performedByName?: string;
  datePerformed?:   string;
  reviewedByName?:  string;
  dateReviewed?:    string;
  wpRef?:           string;
  resultDescription?: string;
  conclusion:       StepConclusion;
  exceptionText?:   string;
  exceptionAmount?: number;
  difRef?:          string;
  hoursPlanned?:    number;
  hoursActual?:     number;
  status:           StepStatus;
  sortOrder:        number;
  evidences:        StepEvidence[];
}

interface AuditProcedure {
  id:             string;
  refNumber:      string;
  description:    string;
  assertions:     string[];
  significantRisk: boolean;
  rmmLevel?:      string;
  rmmRiskRef?:    string;
  conclusionText?: string;
  status:         ProcStatus;
  sortOrder:      number;
  steps:          AuditStep[];
}

// ─── Labels & colors ─────────────────────────────────────────────────────────

const PROC_STATUS_LABEL: Record<ProcStatus, string> = {
  PENDING: 'Pendiente', IN_PROGRESS: 'En curso', COMPLETED: 'Completado', NA: 'N/A',
};
const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  DRAFT: 'Borrador', IN_PROGRESS: 'En curso', SUBMITTED: 'En revisión',
  REVIEWED: 'Revisado', CLEARED: 'Notas limpias', APPROVED: 'Aprobado',
};
const CONCLUSION_LABEL: Record<StepConclusion, string> = {
  PENDING: 'Pendiente', NO_EXCEPTION: 'Sin excepción', EXCEPTION: 'Con excepción', NA: 'N/A',
};
const TEST_TYPE_LABEL: Record<TestType, string> = {
  DETAIL: 'Detalle', ANALYTICAL: 'Analítico', CONTROL: 'Controles',
};
const NATURE_LABEL: Record<AuditNature, string> = {
  INSPECTION: 'Inspección', OBSERVATION: 'Observación', INQUIRY: 'Indagación',
  CONFIRMATION: 'Confirmación', RECALCULATION: 'Recálculo',
  REPERFORMANCE: 'Rejecución', ANALYTICAL: 'Analítico',
};
const TIMING_LABEL: Record<AuditTiming, string> = {
  INTERIM: 'Interino', YEAR_END: 'Cierre', ROLLFORWARD: 'Rollforward',
};

const RMM_COLOR: Record<string, string> = {
  BAJO: 'bg-green-100 text-green-700',
  MODERADO: 'bg-yellow-100 text-yellow-700',
  ALTO: 'bg-orange-100 text-orange-700',
  MUY_ALTO: 'bg-red-100 text-red-700',
};

function ProcStatusBadge({ status }: { status: ProcStatus }) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium';
  const styles: Record<ProcStatus, string> = {
    PENDING:     'bg-gray-100 text-gray-600',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    COMPLETED:   'bg-emerald-100 text-emerald-700',
    NA:          'bg-slate-100 text-slate-500',
  };
  const icons: Record<ProcStatus, React.ReactElement> = {
    PENDING:     <Clock className="w-3 h-3" />,
    IN_PROGRESS: <Loader2 className="w-3 h-3 animate-spin" />,
    COMPLETED:   <CheckCircle2 className="w-3 h-3" />,
    NA:          <MinusCircle className="w-3 h-3" />,
  };
  return (
    <span className={`${base} ${styles[status]}`}>
      {icons[status]}
      {PROC_STATUS_LABEL[status]}
    </span>
  );
}

function ConclusionBadge({ conclusion }: { conclusion: StepConclusion }) {
  const base = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium';
  const styles: Record<StepConclusion, string> = {
    PENDING:      'bg-gray-100 text-gray-500',
    NO_EXCEPTION: 'bg-emerald-100 text-emerald-700',
    EXCEPTION:    'bg-red-100 text-red-700',
    NA:           'bg-slate-100 text-slate-500',
  };
  return <span className={`${base} ${styles[conclusion]}`}>{CONCLUSION_LABEL[conclusion]}</span>;
}

// ─── Step Form ───────────────────────────────────────────────────────────────

const ASSERTIONS_LIST = ['EXI', 'VAL', 'COM', 'OCC', 'EXA', 'COR', 'CLA', 'PRE', 'DER'];

interface StepFormProps {
  initial?: Partial<AuditStep>;
  procedureRef: string;
  onSave: (data: Partial<AuditStep>) => void;
  onCancel: () => void;
  saving: boolean;
}

function StepForm({ initial, procedureRef, onSave, onCancel, saving }: StepFormProps) {
  const [form, setForm] = useState<Partial<AuditStep>>({
    refNumber:    initial?.refNumber    ?? `${procedureRef}-A`,
    description:  initial?.description  ?? '',
    assertions:   initial?.assertions   ?? [],
    testType:     initial?.testType     ?? 'DETAIL',
    nature:       initial?.nature       ?? 'INSPECTION',
    timing:       initial?.timing       ?? 'YEAR_END',
    extent:       initial?.extent       ?? '',
    population:   initial?.population   ?? '',
    performedByName: initial?.performedByName ?? '',
    datePerformed:   initial?.datePerformed   ?? '',
    reviewedByName:  initial?.reviewedByName  ?? '',
    dateReviewed:    initial?.dateReviewed    ?? '',
    wpRef:           initial?.wpRef           ?? '',
    resultDescription: initial?.resultDescription ?? '',
    conclusion:    initial?.conclusion    ?? 'PENDING',
    exceptionText: initial?.exceptionText ?? '',
    hoursPlanned:  initial?.hoursPlanned  ?? undefined,
    hoursActual:   initial?.hoursActual   ?? undefined,
    status:        initial?.status        ?? 'DRAFT',
  });

  const set = (k: keyof AuditStep, v: unknown) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const toggleAssertion = (a: string) =>
    setForm(prev => ({
      ...prev,
      assertions: (prev.assertions ?? []).includes(a)
        ? (prev.assertions ?? []).filter(x => x !== a)
        : [...(prev.assertions ?? []), a],
    }));

  return (
    <div className="bg-white border border-indigo-200 rounded-xl p-4 space-y-3 shadow-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Referencia *</label>
          <input
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.refNumber ?? ''}
            onChange={e => set('refNumber', e.target.value)}
            placeholder="B-AR-01-A"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</label>
          <select
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.status}
            onChange={e => set('status', e.target.value)}
          >
            {(Object.keys(STEP_STATUS_LABEL) as StepStatus[]).map(k => (
              <option key={k} value={k}>{STEP_STATUS_LABEL[k]}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Descripción de la actividad *</label>
        <textarea
          rows={2}
          className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          value={form.description ?? ''}
          onChange={e => set('description', e.target.value)}
          placeholder="Descripción detallada del paso de auditoría..."
        />
      </div>

      {/* Aserciones */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Aserciones (NIA 315)</label>
        <div className="mt-1 flex flex-wrap gap-1">
          {ASSERTIONS_LIST.map(a => (
            <button
              key={a}
              type="button"
              onClick={() => toggleAssertion(a)}
              className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                (form.assertions ?? []).includes(a)
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Tipo / Naturaleza / Timing */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo prueba</label>
          <select
            className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.testType}
            onChange={e => set('testType', e.target.value)}
          >
            {(Object.keys(TEST_TYPE_LABEL) as TestType[]).map(k => (
              <option key={k} value={k}>{TEST_TYPE_LABEL[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Naturaleza</label>
          <select
            className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.nature}
            onChange={e => set('nature', e.target.value)}
          >
            {(Object.keys(NATURE_LABEL) as AuditNature[]).map(k => (
              <option key={k} value={k}>{NATURE_LABEL[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Timing</label>
          <select
            className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.timing}
            onChange={e => set('timing', e.target.value)}
          >
            {(Object.keys(TIMING_LABEL) as AuditTiming[]).map(k => (
              <option key={k} value={k}>{TIMING_LABEL[k]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Extensión / Población */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Extensión / Muestra</label>
          <input
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.extent ?? ''}
            onChange={e => set('extent', e.target.value)}
            placeholder="45 ítems MUS, 100% saldo"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Población / Fuente</label>
          <input
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.population ?? ''}
            onChange={e => set('population', e.target.value)}
            placeholder="Mayor de CxC al 31/12/2025"
          />
        </div>
      </div>

      {/* Realizado por / Revisado por */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Realizado por (ISA 230)</label>
          <input
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.performedByName ?? ''}
            onChange={e => set('performedByName', e.target.value)}
            placeholder="Nombre del auditor"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha realizado</label>
          <input
            type="date"
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.datePerformed ? form.datePerformed.split('T')[0] : ''}
            onChange={e => set('datePerformed', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Revisado por</label>
          <input
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.reviewedByName ?? ''}
            onChange={e => set('reviewedByName', e.target.value)}
            placeholder="Nombre del revisor"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha revisión</label>
          <input
            type="date"
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.dateReviewed ? form.dateReviewed.split('T')[0] : ''}
            onChange={e => set('dateReviewed', e.target.value)}
          />
        </div>
      </div>

      {/* W/P Ref / Conclusión */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">W/P Reference (ISA 230)</label>
          <input
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.wpRef ?? ''}
            onChange={e => set('wpRef', e.target.value)}
            placeholder="AR-03-01"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conclusión (ISA 330 §28d)</label>
          <select
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.conclusion}
            onChange={e => set('conclusion', e.target.value)}
          >
            {(Object.keys(CONCLUSION_LABEL) as StepConclusion[]).map(k => (
              <option key={k} value={k}>{CONCLUSION_LABEL[k]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Resultado */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Descripción del resultado</label>
        <textarea
          rows={2}
          className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          value={form.resultDescription ?? ''}
          onChange={e => set('resultDescription', e.target.value)}
          placeholder="Resultado de la prueba, observaciones relevantes..."
        />
      </div>

      {/* Excepción condicional */}
      {form.conclusion === 'EXCEPTION' && (
        <div className="space-y-2 border border-red-200 rounded-xl p-3 bg-red-50">
          <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> Excepción identificada
          </p>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Descripción de excepción</label>
            <textarea
              rows={2}
              className="mt-1 w-full text-sm border border-red-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white resize-none"
              value={form.exceptionText ?? ''}
              onChange={e => set('exceptionText', e.target.value)}
              placeholder="Descripción de la diferencia encontrada..."
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Referencia PT-DIFS</label>
            <input
              className="mt-1 w-full text-sm border border-red-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
              value={form.difRef ?? ''}
              onChange={e => set('difRef', e.target.value)}
              placeholder="DIF-001"
            />
          </div>
        </div>
      )}

      {/* Horas */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Horas planificadas</label>
          <input
            type="number"
            min={0}
            step={0.5}
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.hoursPlanned ?? ''}
            onChange={e => set('hoursPlanned', e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Horas utilizadas</label>
          <input
            type="number"
            min={0}
            step={0.5}
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.hoursActual ?? ''}
            onChange={e => set('hoursActual', e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={saving || !form.refNumber || !form.description}
          className="flex items-center gap-1 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar
        </button>
      </div>
    </div>
  );
}

// ─── Procedure Form ───────────────────────────────────────────────────────────

interface ProcFormProps {
  initial?: Partial<AuditProcedure>;
  onSave: (data: Partial<AuditProcedure>) => void;
  onCancel: () => void;
  saving: boolean;
}

function ProcForm({ initial, onSave, onCancel, saving }: ProcFormProps) {
  const [form, setForm] = useState<Partial<AuditProcedure>>({
    refNumber:    initial?.refNumber    ?? '',
    description:  initial?.description  ?? '',
    assertions:   initial?.assertions   ?? [],
    significantRisk: initial?.significantRisk ?? false,
    rmmLevel:     initial?.rmmLevel     ?? '',
    status:       initial?.status       ?? 'PENDING',
  });

  const set = (k: keyof AuditProcedure, v: unknown) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const toggleAssertion = (a: string) =>
    setForm(prev => ({
      ...prev,
      assertions: (prev.assertions ?? []).includes(a)
        ? (prev.assertions ?? []).filter(x => x !== a)
        : [...(prev.assertions ?? []), a],
    }));

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Referencia *</label>
          <input
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.refNumber ?? ''}
            onChange={e => set('refNumber', e.target.value)}
            placeholder="B-AR-01"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nivel RMM</label>
          <select
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.rmmLevel ?? ''}
            onChange={e => set('rmmLevel', e.target.value)}
          >
            <option value="">— Sin especificar —</option>
            {['BAJO', 'MODERADO', 'ALTO', 'MUY_ALTO'].map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Descripción del procedimiento *</label>
        <textarea
          rows={2}
          className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          value={form.description ?? ''}
          onChange={e => set('description', e.target.value)}
          placeholder="Descripción del área/ciclo y objetivo del procedimiento..."
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Aserciones relevantes</label>
        <div className="mt-1 flex flex-wrap gap-1">
          {ASSERTIONS_LIST.map(a => (
            <button
              key={a}
              type="button"
              onClick={() => toggleAssertion(a)}
              className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                (form.assertions ?? []).includes(a)
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 text-red-600 rounded"
            checked={form.significantRisk ?? false}
            onChange={e => set('significantRisk', e.target.checked)}
          />
          <span className="text-sm text-gray-700 flex items-center gap-1">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            Riesgo Significativo (NIA 330 §18)
          </span>
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white transition-colors"
        >
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={saving || !form.refNumber || !form.description}
          className="flex items-center gap-1 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar
        </button>
      </div>
    </div>
  );
}

// ─── Step Row ─────────────────────────────────────────────────────────────────

interface StepRowProps {
  step: AuditStep;
  onUpdate: (stepId: string, data: Partial<AuditStep>) => Promise<void>;
  onDelete: (stepId: string) => Promise<void>;
  readOnly: boolean;
}

function StepRow({ step, onUpdate, onDelete, readOnly }: StepRowProps) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async (data: Partial<AuditStep>) => {
    setSaving(true);
    try {
      await onUpdate(step.id, data);
      setEditing(false);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm('¿Eliminar esta actividad?')) return;
    setDeleting(true);
    try { await onDelete(step.id); }
    finally { setDeleting(false); }
  };

  if (editing) {
    return (
      <div className="mt-2">
        <StepForm
          initial={step}
          procedureRef={step.refNumber.split('-').slice(0, -1).join('-')}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
          saving={saving}
        />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors group">
      {/* Left: ref + indicators */}
      <div className="flex-shrink-0 min-w-[80px]">
        <span className="text-xs font-mono font-semibold text-indigo-600">{step.refNumber}</span>
      </div>

      {/* Center: description + metadata */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 leading-snug">{step.description}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {step.assertions.length > 0 && (
            <span className="text-[10px] text-gray-500">
              {step.assertions.join(' · ')}
            </span>
          )}
          <span className="text-[10px] text-gray-400">•</span>
          <span className="text-[10px] text-gray-500">{TEST_TYPE_LABEL[step.testType]}</span>
          <span className="text-[10px] text-gray-400">•</span>
          <span className="text-[10px] text-gray-500">{NATURE_LABEL[step.nature]}</span>
          <span className="text-[10px] text-gray-400">•</span>
          <span className="text-[10px] text-gray-500">{TIMING_LABEL[step.timing]}</span>
          {step.extent && (
            <>
              <span className="text-[10px] text-gray-400">•</span>
              <span className="text-[10px] text-gray-500">{step.extent}</span>
            </>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {step.performedByName && (
            <span className="text-[10px] text-gray-600">
              ✍ {step.performedByName}
              {step.datePerformed && ` · ${new Date(step.datePerformed).toLocaleDateString('es-CL')}`}
            </span>
          )}
          {step.wpRef && (
            <span className="text-[10px] font-mono bg-gray-100 px-1 py-0.5 rounded text-gray-700">
              📎 {step.wpRef}
            </span>
          )}
          <ConclusionBadge conclusion={step.conclusion} />
          {step.conclusion === 'EXCEPTION' && step.exceptionText && (
            <span className="text-[10px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
              ⚠ {step.exceptionText.slice(0, 60)}{step.exceptionText.length > 60 ? '…' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Right: actions */}
      {!readOnly && (
        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="p-1 rounded hover:bg-indigo-100 text-indigo-600 transition-colors"
            title="Editar actividad"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1 rounded hover:bg-red-100 text-red-500 transition-colors"
            title="Eliminar actividad"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Procedure Card ───────────────────────────────────────────────────────────

interface ProcCardProps {
  proc: AuditProcedure;
  onUpdateProc: (id: string, data: Partial<AuditProcedure>) => Promise<void>;
  onDeleteProc: (id: string) => Promise<void>;
  onCreateStep: (procedureId: string, data: Partial<AuditStep>) => Promise<void>;
  onUpdateStep: (stepId: string, data: Partial<AuditStep>) => Promise<void>;
  onDeleteStep: (stepId: string) => Promise<void>;
  readOnly: boolean;
}

function ProcCard({
  proc, onUpdateProc, onDeleteProc, onCreateStep, onUpdateStep, onDeleteStep, readOnly,
}: ProcCardProps) {
  const [open,       setOpen]      = useState(false);
  const [editingProc, setEditProc] = useState(false);
  const [addingStep,  setAddStep]  = useState(false);
  const [saving,     setSaving]    = useState(false);
  const [deleting,   setDeleting]  = useState(false);

  const completedSteps = proc.steps.filter(s => s.status === 'APPROVED' || s.status === 'CLEARED').length;
  const totalSteps = proc.steps.length;

  const handleUpdateProc = async (data: Partial<AuditProcedure>) => {
    setSaving(true);
    try {
      await onUpdateProc(proc.id, data);
      setEditProc(false);
    } finally { setSaving(false); }
  };

  const handleDeleteProc = async () => {
    if (!confirm(`¿Eliminar el procedimiento "${proc.refNumber}" y todas sus actividades?`)) return;
    setDeleting(true);
    try { await onDeleteProc(proc.id); }
    finally { setDeleting(false); }
  };

  const handleAddStep = async (data: Partial<AuditStep>) => {
    setSaving(true);
    try {
      await onCreateStep(proc.id, data);
      setAddStep(false);
    } finally { setSaving(false); }
  };

  if (editingProc) {
    return (
      <div className="border border-indigo-300 rounded-xl overflow-hidden">
        <ProcForm
          initial={proc}
          onSave={handleUpdateProc}
          onCancel={() => setEditProc(false)}
          saving={saving}
        />
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden hover:border-indigo-200 transition-colors">
      {/* Procedure header */}
      <div
        className="flex items-start gap-3 p-3 cursor-pointer select-none bg-white hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-shrink-0 mt-0.5 text-gray-400">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>

        {/* Ref + sig risk */}
        <div className="flex-shrink-0 min-w-[80px]">
          <span className="text-sm font-mono font-bold text-indigo-700">{proc.refNumber}</span>
          {proc.significantRisk && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700">
              <ShieldAlert className="w-2.5 h-2.5" /> SIG
            </span>
          )}
        </div>

        {/* Description + meta */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 leading-snug">{proc.description}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {proc.assertions.length > 0 && (
              <span className="text-xs text-gray-500">{proc.assertions.join(' · ')}</span>
            )}
            {proc.rmmLevel && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${RMM_COLOR[proc.rmmLevel] ?? 'bg-gray-100 text-gray-600'}`}>
                RMM {proc.rmmLevel}
              </span>
            )}
            <ProcStatusBadge status={proc.status} />
            {totalSteps > 0 && (
              <span className="text-[10px] text-gray-500">
                {completedSteps}/{totalSteps} actividades completadas
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        {!readOnly && (
          <div className="flex-shrink-0 flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setEditProc(true)}
              className="p-1.5 rounded-lg hover:bg-indigo-100 text-indigo-600 transition-colors"
              title="Editar procedimiento"
            >
              <FileText className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDeleteProc}
              disabled={deleting}
              className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors"
              title="Eliminar procedimiento"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>

      {/* Steps panel */}
      {open && (
        <div className="border-t border-gray-100 bg-gray-50 px-3 py-3">
          {proc.steps.length === 0 && !addingStep ? (
            <p className="text-xs text-gray-400 italic py-2 text-center">
              Sin actividades. Haz clic en "+ Actividad" para agregar.
            </p>
          ) : (
            <div className="space-y-0.5">
              {proc.steps.map(step => (
                <StepRow
                  key={step.id}
                  step={step}
                  onUpdate={onUpdateStep}
                  onDelete={onDeleteStep}
                  readOnly={readOnly}
                />
              ))}
            </div>
          )}

          {addingStep ? (
            <div className="mt-2">
              <StepForm
                procedureRef={proc.refNumber}
                onSave={handleAddStep}
                onCancel={() => setAddStep(false)}
                saving={saving}
              />
            </div>
          ) : !readOnly ? (
            <button
              onClick={() => setAddStep(true)}
              className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 text-xs text-indigo-600 border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Actividad
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface ProcedureGridPanelProps {
  sectionId: string;
  readOnly?:  boolean;
}

export function ProcedureGridPanel({ sectionId, readOnly = false }: ProcedureGridPanelProps) {
  const [procedures, setProcedures] = useState<AuditProcedure[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [addingProc, setAddProc]    = useState(false);
  const [saving,     setSaving]     = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.get<AuditProcedure[]>(`/audit-procedures/section/${sectionId}`);
      setProcedures(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar procedimientos');
    } finally {
      setLoading(false);
    }
  }, [sectionId]);

  useEffect(() => { load(); }, [load]);

  // ─── Procedure ops

  const handleCreateProc = async (data: Partial<AuditProcedure>) => {
    setSaving(true);
    try {
      const created = await apiClient.post<AuditProcedure>(`/audit-procedures/section/${sectionId}`, data);
      setProcedures(prev => [...prev, created]);
      setAddProc(false);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al crear procedimiento');
    } finally { setSaving(false); }
  };

  const handleUpdateProc = async (id: string, data: Partial<AuditProcedure>) => {
    const updated = await apiClient.patch<AuditProcedure>(`/audit-procedures/${id}`, data);
    setProcedures(prev => prev.map(p => p.id === id ? updated : p));
  };

  const handleDeleteProc = async (id: string) => {
    await apiClient.delete(`/audit-procedures/${id}`);
    setProcedures(prev => prev.filter(p => p.id !== id));
  };

  // ─── Step ops

  const handleCreateStep = async (procedureId: string, data: Partial<AuditStep>) => {
    const created = await apiClient.post<AuditStep>(`/audit-procedures/${procedureId}/steps`, data);
    setProcedures(prev => prev.map(p =>
      p.id === procedureId ? { ...p, steps: [...p.steps, created] } : p,
    ));
  };

  const handleUpdateStep = async (stepId: string, data: Partial<AuditStep>) => {
    const updated = await apiClient.patch<AuditStep>(`/audit-procedures/steps/${stepId}`, data);
    setProcedures(prev => prev.map(p => ({
      ...p,
      steps: p.steps.map(s => s.id === stepId ? updated : s),
    })));
  };

  const handleDeleteStep = async (stepId: string) => {
    await apiClient.delete(`/audit-procedures/steps/${stepId}`);
    setProcedures(prev => prev.map(p => ({
      ...p,
      steps: p.steps.filter(s => s.id !== stepId),
    })));
  };

  // ─── Stats

  const totalSteps     = procedures.reduce((n, p) => n + p.steps.length, 0);
  const completedSteps = procedures.reduce((n, p) =>
    n + p.steps.filter(s => s.status === 'APPROVED' || s.status === 'CLEARED').length, 0);
  const completedPct   = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // ─── Render

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Cargando procedimientos…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-4 text-red-600 text-sm">
        <AlertCircle className="w-4 h-4" />
        {error}
        <button onClick={load} className="ml-2 text-xs underline">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      {procedures.length > 0 && (
        <div className="flex items-center gap-4 px-1 py-1.5 bg-gray-50 rounded-xl text-xs text-gray-600">
          <span>
            <strong className="text-indigo-700">{procedures.length}</strong> procedimientos
          </span>
          <span>
            <strong className="text-indigo-700">{totalSteps}</strong> actividades
          </span>
          <span>
            <strong className={completedPct === 100 ? 'text-emerald-600' : 'text-indigo-700'}>
              {completedPct}%
            </strong> completado
          </span>
          {procedures.some(p => p.significantRisk) && (
            <span className="flex items-center gap-1 text-red-600">
              <ShieldAlert className="w-3 h-3" />
              {procedures.filter(p => p.significantRisk).length} riesgo(s) significativo(s)
            </span>
          )}
        </div>
      )}

      {/* Procedure list */}
      <div className="space-y-2">
        {procedures.map(proc => (
          <ProcCard
            key={proc.id}
            proc={proc}
            onUpdateProc={handleUpdateProc}
            onDeleteProc={handleDeleteProc}
            onCreateStep={handleCreateStep}
            onUpdateStep={handleUpdateStep}
            onDeleteStep={handleDeleteStep}
            readOnly={readOnly}
          />
        ))}
      </div>

      {/* Add procedure form or button */}
      {addingProc ? (
        <ProcForm
          onSave={handleCreateProc}
          onCancel={() => setAddProc(false)}
          saving={saving}
        />
      ) : !readOnly ? (
        <button
          onClick={() => setAddProc(true)}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm text-indigo-600 border-2 border-dashed border-indigo-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-400 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Agregar procedimiento
        </button>
      ) : procedures.length === 0 ? (
        <p className="text-sm text-gray-400 italic text-center py-6">
          Sin procedimientos definidos.
        </p>
      ) : null}
    </div>
  );
}
