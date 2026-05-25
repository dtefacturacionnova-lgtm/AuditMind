'use client';
import { useState } from 'react';
import {
  useEntityTypeConfigs, useCreateEntityType, useUpdateEntityType, useDeleteEntityType,
  useProcessCategoryConfigs, useCreateProcessCategory, useUpdateProcessCategory, useDeleteProcessCategory,
  EntityTypeConfig, ProcessCategoryConfig,
} from '@/hooks/useCatalogs';
import { Plus, Pencil, Trash2, GripVertical, Tag, LayoutList, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const ICON_OPTIONS = ['🏛️','🏢','🗂️','📁','👥','🔹','📍','⚖️','🔷','🔸','🌐','🏭','💼','🏗️'];
const COLOR_OPTIONS = [
  { label: 'Slate',   value: 'bg-slate-200 text-slate-800' },
  { label: 'Blue',    value: 'bg-blue-100 text-blue-800' },
  { label: 'Indigo',  value: 'bg-indigo-100 text-indigo-700' },
  { label: 'Sky',     value: 'bg-sky-100 text-sky-700' },
  { label: 'Teal',    value: 'bg-teal-100 text-teal-700' },
  { label: 'Green',   value: 'bg-green-100 text-green-700' },
  { label: 'Amber',   value: 'bg-amber-100 text-amber-700' },
  { label: 'Purple',  value: 'bg-purple-100 text-purple-700' },
  { label: 'Rose',    value: 'bg-rose-100 text-rose-700' },
  { label: 'Orange',  value: 'bg-orange-100 text-orange-700' },
  { label: 'Cyan',    value: 'bg-cyan-100 text-cyan-700' },
  { label: 'Emerald', value: 'bg-emerald-100 text-emerald-700' },
];

// ─── Entity Type Modal ────────────────────────────────────────────────────────

interface EntityTypeFormData {
  value: string;
  label: string;
  icon: string;
  color: string;
  sortOrder: number;
}

function EntityTypeModal({
  initial, onClose, onSave, isPending,
}: {
  initial?: EntityTypeConfig;
  onClose: () => void;
  onSave: (data: EntityTypeFormData) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<EntityTypeFormData>({
    value: initial?.value ?? '',
    label: initial?.label ?? '',
    icon: initial?.icon ?? '🏢',
    color: initial?.color ?? 'bg-slate-100 text-slate-700',
    sortOrder: initial?.sortOrder ?? 0,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b">
          <h3 className="text-base font-semibold text-gray-900">
            {initial ? 'Editar Tipo de Entidad' : 'Nuevo Tipo de Entidad'}
          </h3>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Clave (value)</label>
            <input
              className={cn(
                'w-full border rounded-lg px-3 py-2 text-sm font-mono uppercase',
                initial ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'focus:outline-none focus:ring-2 focus:ring-blue-500',
              )}
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value.toUpperCase().replace(/\s/g, '_') }))}
              placeholder="EJEMPLO_TIPO"
              disabled={!!initial}
            />
            {initial && <p className="mt-1 text-[11px] text-gray-400">La clave no se puede modificar</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Etiqueta visible *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="Nombre que verán los usuarios"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ícono</label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map(ico => (
                <button
                  key={ico}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, icon: ico }))}
                  className={cn(
                    'w-9 h-9 rounded-lg text-lg flex items-center justify-center border-2 transition-all',
                    form.icon === ico ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:border-gray-300 hover:bg-gray-50',
                  )}
                >{ico}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Color de badge</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, color: opt.value }))}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium border-2 transition-all',
                    opt.value,
                    form.color === opt.value ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent hover:border-gray-300',
                  )}
                >{opt.label}</button>
              ))}
            </div>
            {/* Preview */}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-400">Vista previa:</span>
              <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', form.color)}>
                {form.label || 'Etiqueta'}
              </span>
              <span className="text-lg">{form.icon}</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Orden de aparición</label>
            <input
              type="number"
              className="w-24 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.sortOrder}
              onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition-colors"
            disabled={isPending}
          >Cancelar</button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.value || !form.label || isPending}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Process Category Modal ───────────────────────────────────────────────────

function ProcessCategoryModal({
  initial, onClose, onSave, isPending,
}: {
  initial?: ProcessCategoryConfig;
  onClose: () => void;
  onSave: (data: { code: string; name: string; type: string; sortOrder: number }) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    type: initial?.type ?? 'OPERATING',
    sortOrder: initial?.sortOrder ?? 0,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b">
          <h3 className="text-base font-semibold text-gray-900">
            {initial ? 'Editar Categoría de Proceso' : 'Nueva Categoría de Proceso'}
          </h3>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
              <input
                className={cn(
                  'w-full border rounded-lg px-3 py-2 text-sm font-mono',
                  initial ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'focus:outline-none focus:ring-2 focus:ring-blue-500',
                )}
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="14.0"
                disabled={!!initial}
              />
              {initial && <p className="mt-1 text-[11px] text-gray-400">El código no se puede cambiar</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              >
                <option value="STRATEGIC">Estratégico</option>
                <option value="OPERATING">Misional / Operativo</option>
                <option value="SUPPORT">Soporte / Gestión</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nombre de la categoría de proceso"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Orden de aparición</label>
            <input
              type="number"
              className="w-24 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.sortOrder}
              onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition-colors"
            disabled={isPending}
          >Cancelar</button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.code || !form.name || isPending}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CatalogsPage() {
  const [tab, setTab] = useState<'entity-types' | 'process-categories'>('entity-types');

  const { data: entityTypes = [], isLoading: loadingET } = useEntityTypeConfigs();
  const { data: processCategories = [], isLoading: loadingPC } = useProcessCategoryConfigs();

  const createET = useCreateEntityType();
  const updateET = useUpdateEntityType();
  const deleteET = useDeleteEntityType();
  const createPC = useCreateProcessCategory();
  const updatePC = useUpdateProcessCategory();
  const deletePC = useDeleteProcessCategory();

  const etPending = createET.isPending || updateET.isPending;
  const pcPending = createPC.isPending || updatePC.isPending;

  const [etModal, setEtModal] = useState<{ mode: 'create' } | { mode: 'edit'; item: EntityTypeConfig } | null>(null);
  const [pcModal, setPcModal] = useState<{ mode: 'create' } | { mode: 'edit'; item: ProcessCategoryConfig } | null>(null);

  const strategicCats = processCategories.filter(c => c.type === 'STRATEGIC');
  const operatingCats = processCategories.filter(c => c.type === 'OPERATING');
  const supportCats   = processCategories.filter(c => c.type === 'SUPPORT');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Catálogos Generales</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Personaliza las clasificaciones del organigrama y los procesos de tu organización
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-6">
        <button
          onClick={() => setTab('entity-types')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            tab === 'entity-types' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900',
          )}
        >
          <Tag className="w-4 h-4" />
          Tipos de Entidad
        </button>
        <button
          onClick={() => setTab('process-categories')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            tab === 'process-categories' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900',
          )}
        >
          <LayoutList className="w-4 h-4" />
          Categorías de Proceso
        </button>
      </div>

      {/* ── Entity Types ── */}
      {tab === 'entity-types' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Tipos de Entidad del Organigrama</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Estos tipos aparecen en el selector al crear o editar áreas del organigrama
              </p>
            </div>
            <button
              onClick={() => setEtModal({ mode: 'create' })}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Agregar tipo
            </button>
          </div>

          {loadingET ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
            </div>
          ) : (
            <div className="bg-white rounded-xl border divide-y">
              {entityTypes.map((et) => (
                <div key={et.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  <span className="text-xl w-8 text-center">{et.icon}</span>
                  <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', et.color)}>
                    {et.label}
                  </span>
                  <span className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{et.value}</span>
                  <span className="text-xs text-gray-400 ml-auto mr-0">orden: {et.sortOrder}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEtModal({ mode: 'edit', item: et })}
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { if (confirm(`¿Eliminar el tipo "${et.label}"?`)) deleteET.mutate(et.id); }}
                      disabled={deleteET.isPending}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 disabled:opacity-40 transition-colors"
                      title="Eliminar"
                    >
                      {deleteET.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}
              {entityTypes.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-sm">No hay tipos de entidad configurados</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Process Categories ── */}
      {tab === 'process-categories' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Categorías de Proceso</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Marco de clasificación basado en APQC PCF v8.0 — adaptable a tu organización
              </p>
            </div>
            <button
              onClick={() => setPcModal({ mode: 'create' })}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Agregar categoría
            </button>
          </div>

          {loadingPC ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
            </div>
          ) : (
            <div className="space-y-6">
              {/* Strategic */}
              <ProcessSection
                title="Procesos Estratégicos"
                subtitle="Gobierno, dirección y gestión del riesgo empresarial"
                badgeClass="bg-emerald-100 text-emerald-800"
                categories={strategicCats}
                onEdit={(cat) => setPcModal({ mode: 'edit', item: cat })}
                onDelete={(cat) => { if (confirm(`¿Eliminar "${cat.name}"?`)) deletePC.mutate(cat.id); }}
                emptyLabel="Sin categorías estratégicas"
                isPendingDelete={deletePC.isPending}
              />

              {/* Operating */}
              <ProcessSection
                title="Procesos Misionales / Operativos"
                subtitle="Generan valor directo al cliente o usuario final"
                badgeClass="bg-blue-100 text-blue-800"
                categories={operatingCats}
                onEdit={(cat) => setPcModal({ mode: 'edit', item: cat })}
                onDelete={(cat) => { if (confirm(`¿Eliminar "${cat.name}"?`)) deletePC.mutate(cat.id); }}
                emptyLabel="Sin categorías operativas"
                isPendingDelete={deletePC.isPending}
              />

              {/* Support */}
              <ProcessSection
                title="Procesos de Soporte / Gestión"
                subtitle="Habilitan y dan soporte a los procesos operativos"
                badgeClass="bg-purple-100 text-purple-800"
                categories={supportCats}
                onEdit={(cat) => setPcModal({ mode: 'edit', item: cat })}
                onDelete={(cat) => { if (confirm(`¿Eliminar "${cat.name}"?`)) deletePC.mutate(cat.id); }}
                emptyLabel="Sin categorías de soporte"
                isPendingDelete={deletePC.isPending}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {etModal && (
        <EntityTypeModal
          initial={etModal.mode === 'edit' ? etModal.item : undefined}
          onClose={() => setEtModal(null)}
          isPending={etPending}
          onSave={(data) => {
            if (etModal.mode === 'create') {
              createET.mutate(data, { onSuccess: () => setEtModal(null) });
            } else {
              // Strip `value` — it's immutable and not accepted by UpdateEntityTypeDto
              const { value: _v, ...updateData } = data;
              updateET.mutate({ id: etModal.item.id, data: updateData }, { onSuccess: () => setEtModal(null) });
            }
          }}
        />
      )}

      {pcModal && (
        <ProcessCategoryModal
          initial={pcModal.mode === 'edit' ? pcModal.item : undefined}
          onClose={() => setPcModal(null)}
          isPending={pcPending}
          onSave={(data) => {
            if (pcModal.mode === 'create') {
              createPC.mutate(data, { onSuccess: () => setPcModal(null) });
            } else {
              // Strip `code` — it's immutable and not accepted by UpdateProcessCategoryDto
              const { code: _c, ...updateData } = data;
              updatePC.mutate({ id: pcModal.item.id, data: updateData }, { onSuccess: () => setPcModal(null) });
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Process Section ──────────────────────────────────────────────────────────

function ProcessSection({
  title, subtitle, badgeClass, categories, onEdit, onDelete, emptyLabel, isPendingDelete,
}: {
  title: string;
  subtitle: string;
  badgeClass: string;
  categories: ProcessCategoryConfig[];
  onEdit: (cat: ProcessCategoryConfig) => void;
  onDelete: (cat: ProcessCategoryConfig) => void;
  emptyLabel: string;
  isPendingDelete: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full', badgeClass)}>
          {title}
        </span>
        <span className="text-xs text-gray-400">{subtitle}</span>
      </div>
      <div className="bg-white rounded-xl border divide-y">
        {categories.map((cat) => (
          <CategoryRow
            key={cat.id}
            cat={cat}
            onEdit={() => onEdit(cat)}
            onDelete={() => onDelete(cat)}
            isPendingDelete={isPendingDelete}
          />
        ))}
        {categories.length === 0 && (
          <div className="text-center py-8 text-sm text-gray-400">{emptyLabel}</div>
        )}
      </div>
    </div>
  );
}

function CategoryRow({
  cat, onEdit, onDelete, isPendingDelete,
}: {
  cat: ProcessCategoryConfig;
  onEdit: () => void;
  onDelete: () => void;
  isPendingDelete: boolean;
}) {
  const typeLabel =
    cat.type === 'STRATEGIC' ? 'Estratégico' :
    cat.type === 'OPERATING' ? 'Misional / Op.' : 'Soporte / Gest.';
  const typeBadge =
    cat.type === 'STRATEGIC' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    cat.type === 'OPERATING' ? 'bg-blue-50 text-blue-700 border-blue-200' :
    'bg-purple-50 text-purple-700 border-purple-200';

  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors">
      <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
      <span className="font-mono text-sm font-bold text-gray-500 w-12 shrink-0">{cat.code}</span>
      <span className="text-sm text-gray-800 flex-1">{cat.name}</span>
      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border shrink-0', typeBadge)}>
        {typeLabel}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
          title="Editar"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          disabled={isPendingDelete}
          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 disabled:opacity-40 transition-colors"
          title="Eliminar"
        >
          {isPendingDelete ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
