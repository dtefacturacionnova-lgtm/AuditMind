'use client';
import { useState } from 'react';
import {
  useEntityTypeConfigs, useCreateEntityType, useUpdateEntityType, useDeleteEntityType,
  useProcessCategoryConfigs, useCreateProcessCategory, useUpdateProcessCategory, useDeleteProcessCategory,
  EntityTypeConfig, ProcessCategoryConfig,
} from '@/hooks/useCatalogs';
import { Plus, Pencil, Trash2, GripVertical, CheckCircle2, XCircle, Tag, LayoutList } from 'lucide-react';
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
  initial, onClose, onSave,
}: {
  initial?: EntityTypeConfig;
  onClose: () => void;
  onSave: (data: EntityTypeFormData) => void;
}) {
  const [form, setForm] = useState<EntityTypeFormData>({
    value: initial?.value ?? '',
    label: initial?.label ?? '',
    icon: initial?.icon ?? '🏢',
    color: initial?.color ?? 'bg-slate-100 text-slate-700',
    sortOrder: initial?.sortOrder ?? 0,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-4">
          {initial ? 'Editar Tipo de Entidad' : 'Nuevo Tipo de Entidad'}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Clave (value)</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono uppercase"
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value.toUpperCase().replace(/\s/g, '_') }))}
              placeholder="EJEMPLO_TIPO"
              disabled={!!initial}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Etiqueta</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="Nombre visible"
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
                    form.icon === ico ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:border-gray-300',
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
                    form.color === opt.value ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent',
                  )}
                >{opt.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Orden</label>
            <input
              type="number"
              className="w-24 border rounded-lg px-3 py-2 text-sm"
              value={form.sortOrder}
              onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
            />
          </div>
        </div>
        <div className="mt-6 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">Cancelar</button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.value || !form.label}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Process Category Modal ───────────────────────────────────────────────────

function ProcessCategoryModal({
  initial, onClose, onSave,
}: {
  initial?: ProcessCategoryConfig;
  onClose: () => void;
  onSave: (data: { code: string; name: string; type: string; sortOrder: number }) => void;
}) {
  const [form, setForm] = useState({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    type: initial?.type ?? 'OPERATING',
    sortOrder: initial?.sortOrder ?? 0,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-4">
          {initial ? 'Editar Categoría de Proceso' : 'Nueva Categoría de Proceso'}
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="14.0"
                disabled={!!initial}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              >
                <option value="OPERATING">Operativo (1.0–6.0)</option>
                <option value="SUPPORT">Soporte / Gestión (7.0+)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nombre de la categoría"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Orden</label>
            <input
              type="number"
              className="w-24 border rounded-lg px-3 py-2 text-sm"
              value={form.sortOrder}
              onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
            />
          </div>
        </div>
        <div className="mt-6 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">Cancelar</button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.code || !form.name}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >Guardar</button>
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

  const [etModal, setEtModal] = useState<{ mode: 'create' } | { mode: 'edit'; item: EntityTypeConfig } | null>(null);
  const [pcModal, setPcModal] = useState<{ mode: 'create' } | { mode: 'edit'; item: ProcessCategoryConfig } | null>(null);

  const operatingCats = processCategories.filter(c => c.type === 'OPERATING');
  const supportCats   = processCategories.filter(c => c.type !== 'OPERATING');

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
            <div className="text-center py-12 text-gray-400">Cargando…</div>
          ) : (
            <div className="bg-white rounded-xl border divide-y">
              {entityTypes.map((et) => (
                <div key={et.id} className="flex items-center gap-4 px-4 py-3">
                  <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  <span className="text-lg w-8 text-center">{et.icon}</span>
                  <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', et.color)}>
                    {et.label}
                  </span>
                  <span className="font-mono text-xs text-gray-400">{et.value}</span>
                  <div className="ml-auto flex items-center gap-2">
                    {et.active ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-gray-300" />
                    )}
                    <button
                      onClick={() => setEtModal({ mode: 'edit', item: et })}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteET.mutate(et.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
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
              <h2 className="text-base font-semibold text-gray-800">Categorías APQC PCF</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Marco de Clasificación de Procesos de tu organización (basado en APQC PCF v8.0)
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
            <div className="text-center py-12 text-gray-400">Cargando…</div>
          ) : (
            <div className="space-y-6">
              {/* Operating */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600">Procesos Operativos</span>
                  <span className="text-xs text-gray-400">(generan valor directo al cliente)</span>
                </div>
                <div className="bg-white rounded-xl border divide-y">
                  {operatingCats.map((cat) => (
                    <CategoryRow
                      key={cat.id} cat={cat}
                      onEdit={() => setPcModal({ mode: 'edit', item: cat })}
                      onDelete={() => deletePC.mutate(cat.id)}
                    />
                  ))}
                  {operatingCats.length === 0 && <EmptyRow label="Sin categorías operativas" />}
                </div>
              </div>

              {/* Support */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-600">Procesos de Soporte y Gestión</span>
                  <span className="text-xs text-gray-400">(habilitan los procesos operativos)</span>
                </div>
                <div className="bg-white rounded-xl border divide-y">
                  {supportCats.map((cat) => (
                    <CategoryRow
                      key={cat.id} cat={cat}
                      onEdit={() => setPcModal({ mode: 'edit', item: cat })}
                      onDelete={() => deletePC.mutate(cat.id)}
                    />
                  ))}
                  {supportCats.length === 0 && <EmptyRow label="Sin categorías de soporte" />}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {etModal && (
        <EntityTypeModal
          initial={etModal.mode === 'edit' ? etModal.item : undefined}
          onClose={() => setEtModal(null)}
          onSave={(data) => {
            if (etModal.mode === 'create') {
              createET.mutate(data, { onSuccess: () => setEtModal(null) });
            } else {
              updateET.mutate({ id: etModal.item.id, data }, { onSuccess: () => setEtModal(null) });
            }
          }}
        />
      )}

      {pcModal && (
        <ProcessCategoryModal
          initial={pcModal.mode === 'edit' ? pcModal.item : undefined}
          onClose={() => setPcModal(null)}
          onSave={(data) => {
            if (pcModal.mode === 'create') {
              createPC.mutate(data, { onSuccess: () => setPcModal(null) });
            } else {
              updatePC.mutate({ id: pcModal.item.id, data }, { onSuccess: () => setPcModal(null) });
            }
          }}
        />
      )}
    </div>
  );
}

function CategoryRow({ cat, onEdit, onDelete }: { cat: ProcessCategoryConfig; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
      <span className="font-mono text-sm font-bold text-gray-500 w-10">{cat.code}</span>
      <span className="text-sm text-gray-800 flex-1">{cat.name}</span>
      <span className={cn(
        'px-2 py-0.5 rounded-full text-xs font-medium',
        cat.type === 'OPERATING' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700',
      )}>
        {cat.type === 'OPERATING' ? 'Operativo' : 'Soporte'}
      </span>
      <div className="flex items-center gap-1">
        <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="text-center py-8 text-sm text-gray-400">{label}</div>;
}
