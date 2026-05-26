'use client';
import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Save, Target, ChevronDown, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useStrategicObjectives, useCreateObjective, useUpdateObjective, useDeleteObjective,
  useCreateLine, useUpdateLine, useDeleteLine,
  type StrategicObjective, type StrategicLine,
} from '@/hooks/useStrategic';
import { cn } from '@/lib/utils';

// ─── Color themes ─────────────────────────────────────────────────────────────
const COLOR_THEMES: Record<string, {
  header: string; headerText: string; badge: string; dot: string;
  lineBorder: string; lineHover: string; ring: string; light: string;
}> = {
  blue:   { header: 'bg-blue-700',    headerText: 'text-white', badge: 'bg-blue-900/50 text-blue-100', dot: 'bg-blue-400',    lineBorder: 'border-l-blue-400',   lineHover: 'hover:bg-blue-50',   ring: 'ring-blue-500',   light: 'bg-blue-50'   },
  green:  { header: 'bg-emerald-700', headerText: 'text-white', badge: 'bg-emerald-900/50 text-emerald-100', dot: 'bg-emerald-400', lineBorder: 'border-l-emerald-400', lineHover: 'hover:bg-emerald-50', ring: 'ring-emerald-500', light: 'bg-emerald-50' },
  amber:  { header: 'bg-amber-600',   headerText: 'text-white', badge: 'bg-amber-900/50 text-amber-100',    dot: 'bg-amber-400',   lineBorder: 'border-l-amber-400',   lineHover: 'hover:bg-amber-50',   ring: 'ring-amber-500',   light: 'bg-amber-50'   },
  rose:   { header: 'bg-rose-700',    headerText: 'text-white', badge: 'bg-rose-900/50 text-rose-100',      dot: 'bg-rose-400',    lineBorder: 'border-l-rose-400',    lineHover: 'hover:bg-rose-50',    ring: 'ring-rose-500',    light: 'bg-rose-50'    },
  purple: { header: 'bg-purple-700',  headerText: 'text-white', badge: 'bg-purple-900/50 text-purple-100',  dot: 'bg-purple-400',  lineBorder: 'border-l-purple-400',  lineHover: 'hover:bg-purple-50',  ring: 'ring-purple-500',  light: 'bg-purple-50'  },
  teal:   { header: 'bg-teal-700',    headerText: 'text-white', badge: 'bg-teal-900/50 text-teal-100',      dot: 'bg-teal-400',    lineBorder: 'border-l-teal-400',    lineHover: 'hover:bg-teal-50',    ring: 'ring-teal-500',    light: 'bg-teal-50'    },
  orange: { header: 'bg-orange-600',  headerText: 'text-white', badge: 'bg-orange-900/50 text-orange-100',  dot: 'bg-orange-400',  lineBorder: 'border-l-orange-400',  lineHover: 'hover:bg-orange-50',  ring: 'ring-orange-500',  light: 'bg-orange-50'  },
  indigo: { header: 'bg-indigo-700',  headerText: 'text-white', badge: 'bg-indigo-900/50 text-indigo-100',  dot: 'bg-indigo-400',  lineBorder: 'border-l-indigo-400',  lineHover: 'hover:bg-indigo-50',  ring: 'ring-indigo-500',  light: 'bg-indigo-50'  },
};

const COLOR_OPTIONS = [
  { value: 'blue',   label: 'Azul',    swatch: 'bg-blue-600'   },
  { value: 'green',  label: 'Verde',   swatch: 'bg-emerald-600' },
  { value: 'amber',  label: 'Ámbar',   swatch: 'bg-amber-500'  },
  { value: 'rose',   label: 'Rosa',    swatch: 'bg-rose-600'   },
  { value: 'purple', label: 'Morado',  swatch: 'bg-purple-600' },
  { value: 'teal',   label: 'Teal',    swatch: 'bg-teal-600'   },
  { value: 'orange', label: 'Naranja', swatch: 'bg-orange-500' },
  { value: 'indigo', label: 'Índigo',  swatch: 'bg-indigo-600' },
];

const ICON_OPTIONS = ['🎯','📈','⚙️','🔐','💡','🌱','🤝','📊','🏆','🔬','🌐','💎'];

function theme(color: string) {
  return COLOR_THEMES[color] ?? COLOR_THEMES['blue'];
}

// ─── ObjectiveModal ───────────────────────────────────────────────────────────
function ObjectiveModal({ obj, onClose }: { obj?: StrategicObjective; onClose: () => void }) {
  const create = useCreateObjective();
  const update = useUpdateObjective();
  const isEdit = !!obj;

  const [form, setForm] = useState({
    code:        obj?.code        ?? '',
    name:        obj?.name        ?? '',
    description: obj?.description ?? '',
    color:       obj?.color       ?? 'blue',
    icon:        obj?.icon        ?? '🎯',
  });
  const [saving, setSaving]   = useState(false);
  const [error,  setError]    = useState<string | null>(null);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const t = theme(form.color);

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const payload = { ...form, description: form.description.trim() || undefined };
      if (isEdit) {
        const { code: _c, ...rest } = payload;
        await update.mutateAsync({ id: obj!.id, data: rest });
      } else {
        await create.mutateAsync(payload);
      }
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Error al guardar. Intenta de nuevo.';
      setError(Array.isArray(msg) ? msg.join(' · ') : String(msg));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Preview header */}
        <div className={cn('px-6 py-5 flex items-center gap-4', t.header)}>
          <span className="text-4xl">{form.icon}</span>
          <div>
            <p className={cn('text-xs font-mono font-bold opacity-70', t.headerText)}>
              {form.code || 'OE-?'}
            </p>
            <p className={cn('text-lg font-bold leading-tight', t.headerText)}>
              {form.name || 'Nombre del objetivo'}
            </p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-full p-1.5 hover:bg-white/20">
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">Código *</label>
              <input
                value={form.code}
                onChange={e => set('code', e.target.value)}
                disabled={isEdit}
                placeholder="OE-1"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Ícono</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {ICON_OPTIONS.map(ic => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => set('icon', ic)}
                    className={cn(
                      'text-xl rounded-lg p-1 transition-all',
                      form.icon === ic ? 'ring-2 ring-blue-500 scale-110' : 'hover:bg-slate-100',
                    )}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700">Nombre del Objetivo *</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Ej: Rentabilidad y Solidez Financiera"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700">Descripción (opcional)</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Describe el alcance de este objetivo estratégico…"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700">Color del pilar</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => set('color', c.value)}
                  title={c.label}
                  className={cn(
                    'h-7 w-7 rounded-full transition-all',
                    c.swatch,
                    form.color === c.value ? 'ring-2 ring-offset-2 ring-slate-500 scale-110' : 'hover:scale-110',
                  )}
                />
              ))}
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm border border-slate-300 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!form.code.trim() || !form.name.trim() || saving}
            className={cn(
              'rounded-lg px-4 py-2 text-sm text-white font-medium flex items-center gap-1.5 disabled:opacity-60 transition-opacity',
              t.header,
            )}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? 'Guardando…' : isEdit ? 'Actualizar' : 'Crear Objetivo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LineModal ────────────────────────────────────────────────────────────────
function LineModal({ line, objectiveId, objectiveColor, onClose }: {
  line?: StrategicLine; objectiveId: string; objectiveColor: string; onClose: () => void;
}) {
  const create = useCreateLine();
  const update = useUpdateLine();
  const isEdit = !!line;

  const [form, setForm] = useState({
    code:        line?.code        ?? '',
    name:        line?.name        ?? '',
    description: line?.description ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const t = theme(objectiveColor);

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const payload = { ...form, description: form.description.trim() || undefined };
      if (isEdit) {
        const { code: _c, ...rest } = payload;
        await update.mutateAsync({ id: line!.id, data: { ...rest } });
      } else {
        await create.mutateAsync({ objectiveId, ...payload });
      }
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Error al guardar. Intenta de nuevo.';
      setError(Array.isArray(msg) ? msg.join(' · ') : String(msg));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className={cn('px-6 py-4 flex items-center justify-between', t.header)}>
          <div>
            <p className="text-xs font-mono text-white/70">{isEdit ? 'Editar Línea' : 'Nueva Línea Estratégica'}</p>
            <p className="text-base font-bold text-white">{form.code || 'LE-?.?'} — {form.name || '…'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-white/20">
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-700">Código *</label>
            <input
              value={form.code}
              onChange={e => set('code', e.target.value)}
              disabled={isEdit}
              placeholder="LE-1.1"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Nombre de la Línea *</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Ej: Gestión eficiente del capital de trabajo"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Descripción (opcional)</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm border border-slate-300 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!form.code.trim() || !form.name.trim() || saving}
            className={cn(
              'rounded-lg px-4 py-2 text-sm text-white font-medium flex items-center gap-1.5 disabled:opacity-60',
              t.header,
            )}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? 'Guardando…' : isEdit ? 'Actualizar' : 'Crear Línea'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ObjectivePillar ──────────────────────────────────────────────────────────
function ObjectivePillar({ obj }: { obj: StrategicObjective }) {
  const deleteObj  = useDeleteObjective();
  const deleteLine = useDeleteLine();
  const [editObj,  setEditObj]  = useState(false);
  const [addLine,  setAddLine]  = useState(false);
  const [editLine, setEditLine] = useState<StrategicLine | null>(null);
  const [expanded, setExpanded] = useState(true);
  const t = theme(obj.color);

  const handleDeleteObj = async () => {
    if (!confirm(`¿Eliminar objetivo "${obj.name}" y todas sus líneas?`)) return;
    await deleteObj.mutateAsync(obj.id);
  };

  const handleDeleteLine = async (line: StrategicLine) => {
    if (!confirm(`¿Eliminar línea "${line.name}"?`)) return;
    await deleteLine.mutateAsync(line.id);
  };

  return (
    <>
      <div className="flex flex-col rounded-2xl overflow-hidden shadow-lg border border-slate-200 bg-white min-w-[230px] max-w-[260px] flex-shrink-0">

        {/* ── Colored header ── */}
        <div className={cn('relative px-4 pt-5 pb-4', t.header)}>
          <div className="flex flex-col items-center text-center gap-1">
            <span className="text-3xl mb-1">{obj.icon}</span>
            <span className={cn('text-xs font-mono font-bold px-2 py-0.5 rounded-full', t.badge)}>
              {obj.code}
            </span>
            <p className={cn('text-sm font-bold leading-snug mt-1', t.headerText)}>
              {obj.name}
            </p>
            {obj.description && (
              <p className="text-xs text-white/60 mt-0.5 line-clamp-2">{obj.description}</p>
            )}
          </div>
        </div>

        {/* ── Action bar (always visible) ── */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5">
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {obj.lines.length} línea{obj.lines.length !== 1 ? 's' : ''}
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setEditObj(true)}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Editar
            </button>
            <button
              type="button"
              onClick={handleDeleteObj}
              disabled={deleteObj.isPending}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
            >
              {deleteObj.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Eliminar
            </button>
          </div>
        </div>

        {/* ── Strategic lines ── */}
        {expanded && (
          <div className="flex flex-col divide-y divide-slate-100 bg-white flex-1">
            {obj.lines.length === 0 && (
              <p className="px-4 py-4 text-xs text-slate-400 text-center italic">Sin líneas aún</p>
            )}
            {obj.lines.map(line => (
              <div
                key={line.id}
                className={cn(
                  'group flex items-start gap-2 px-3 py-2.5 border-l-[3px] transition-colors',
                  t.lineBorder, t.lineHover,
                )}
              >
                <div className={cn('mt-1 h-1.5 w-1.5 rounded-full shrink-0', t.dot)} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-mono font-semibold text-slate-500">{line.code}</p>
                  <p className="text-xs font-medium text-slate-800 leading-snug">{line.name}</p>
                  {line.description && (
                    <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{line.description}</p>
                  )}
                </div>
                {/* Line actions — visible on hover */}
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditLine(line)}
                    className="rounded p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                    title="Editar línea"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteLine(line)}
                    className="rounded p-1 hover:bg-red-50 text-slate-400 hover:text-red-500"
                    title="Eliminar línea"
                    disabled={deleteLine.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}

            {/* Add line button */}
            <button
              type="button"
              onClick={() => setAddLine(true)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-l-[3px] border-l-transparent',
                'text-slate-400 hover:text-slate-600 hover:bg-slate-50',
              )}
            >
              <Plus className="h-3 w-3" />
              Agregar línea
            </button>
          </div>
        )}
      </div>

      {editObj  && <ObjectiveModal obj={obj} onClose={() => setEditObj(false)} />}
      {addLine  && <LineModal objectiveId={obj.id} objectiveColor={obj.color} onClose={() => setAddLine(false)} />}
      {editLine && <LineModal line={editLine} objectiveId={obj.id} objectiveColor={obj.color} onClose={() => setEditLine(null)} />}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function StrategicPage() {
  const { data: objectives = [], isLoading } = useStrategicObjectives();
  const [showNewObj, setShowNewObj] = useState(false);

  const totalLines = objectives.reduce((s, o) => s + o.lines.length, 0);

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Plan Estratégico"
        breadcrumbs={[{ label: 'Planificación Anual' }, { label: 'Plan Estratégico' }]}
      />

      <div className="flex-1 overflow-auto">
        {/* ── Hero banner ── */}
        <div className="bg-gradient-to-br from-[#0f2d4a] via-[#1a4a7a] to-[#0f3460] px-6 pt-6 pb-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-5 w-5 text-blue-300" />
                <span className="text-xs font-semibold text-blue-300 uppercase tracking-widest">Mapa Estratégico</span>
              </div>
              <h2 className="text-2xl font-bold text-white">Objetivos y Líneas Estratégicas</h2>
              <p className="text-sm text-blue-200 mt-1">
                Define los pilares que guían el universo de auditoría — cada línea estratégica se vincula a procesos del mapa.
              </p>
              <div className="flex gap-4 mt-3">
                <div className="rounded-lg bg-white/10 px-3 py-1.5 text-center">
                  <p className="text-xl font-bold text-white">{objectives.length}</p>
                  <p className="text-[10px] text-blue-300">Objetivos</p>
                </div>
                <div className="rounded-lg bg-white/10 px-3 py-1.5 text-center">
                  <p className="text-xl font-bold text-white">{totalLines}</p>
                  <p className="text-[10px] text-blue-300">Líneas estratégicas</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowNewObj(true)}
              className="flex items-center gap-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition-all shadow"
            >
              <Plus className="h-4 w-4" />
              Agregar Objetivo
            </button>
          </div>
        </div>

        {/* ── Pillars area ── */}
        <div className="bg-gradient-to-b from-slate-100 to-slate-50 min-h-[calc(100vh-280px)] p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : objectives.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-200">
                <Target className="h-10 w-10 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-600">Sin objetivos estratégicos</h3>
              <p className="text-sm text-slate-400 mt-1 max-w-sm">
                Agrega los objetivos del plan estratégico de tu organización. Cada objetivo contendrá líneas que se vincularán al universo de auditoría.
              </p>
              <button
                type="button"
                onClick={() => setShowNewObj(true)}
                className="mt-5 flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 shadow-lg"
              >
                <Plus className="h-4 w-4" /> Crear primer objetivo
              </button>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {objectives.map(obj => (
                <ObjectivePillar key={obj.id} obj={obj} />
              ))}
              {/* Ghost card */}
              <button
                type="button"
                onClick={() => setShowNewObj(true)}
                className="flex flex-col items-center justify-center min-w-[180px] max-w-[180px] rounded-2xl border-2 border-dashed border-slate-300 hover:border-slate-400 hover:bg-white/60 text-slate-400 hover:text-slate-600 transition-all gap-2 py-10 flex-shrink-0"
              >
                <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center">
                  <Plus className="h-5 w-5" />
                </div>
                <span className="text-xs font-medium">Nuevo objetivo</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {showNewObj && <ObjectiveModal onClose={() => setShowNewObj(false)} />}
    </div>
  );
}
