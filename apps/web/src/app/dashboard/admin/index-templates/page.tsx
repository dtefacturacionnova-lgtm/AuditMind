'use client';

import { useState } from 'react';
import {
  Plus, Pencil, Trash2, Star, Lock, Folder, FolderOpen,
  ChevronDown, ChevronRight, FolderPlus, X, Check, Loader2,
  Copy, Settings2,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useIndexTemplates, useCreateIndexTemplate, useUpdateIndexTemplate,
  useDeleteIndexTemplate, useSetDefaultTemplate,
  type IndexTemplate, type PhaseTemplate, type FolderTemplate,
  type CreateTemplateData, IIA_STARTER, countStructure,
} from '@/hooks/useIndexTemplates';
import { PHASE_CONFIG, type PhaseType } from '@/hooks/useExpediente';
import { cn } from '@/lib/utils';

// ─── Phase labels (readable names for selects) ───────────────────────────────

const PHASE_TYPES: PhaseType[] = ['PLANNING', 'FIELDWORK', 'REPORTING', 'FOLLOWUP'];

// ─── Folder tree editor ───────────────────────────────────────────────────────

function FolderEditorRow({
  folder,
  depth,
  onEdit,
  onDelete,
  onAddChild,
}: {
  folder: FolderTemplate;
  depth: number;
  onEdit:     (f: FolderTemplate) => void;
  onDelete:   (f: FolderTemplate) => void;
  onAddChild: (parent: FolderTemplate) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = (folder.children?.length ?? 0) > 0;

  return (
    <div>
      <div
        className="group flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-slate-50"
        style={{ paddingLeft: `${8 + depth * 18}px` }}
      >
        <button onClick={() => setOpen(!open)} className="shrink-0 text-slate-400">
          {hasChildren
            ? (open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)
            : <span className="inline-block w-3" />
          }
        </button>
        {open && hasChildren
          ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          : <Folder     className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        }
        <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-600">
          {folder.ref}
        </span>
        <span className="flex-1 truncate text-xs text-slate-700">{folder.name}</span>

        <div className="hidden items-center gap-0.5 group-hover:flex">
          {depth === 0 && (
            <button
              onClick={() => onAddChild(folder)}
              title="Sub-carpeta"
              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            >
              <FolderPlus className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={() => onEdit(folder)}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-blue-600"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={() => onDelete(folder)}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-red-600"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {open && hasChildren && (
        <div>
          {folder.children!.map((child, ci) => (
            <FolderEditorRow
              key={`${child.ref}-${ci}`}
              folder={child}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Quick folder input (inline add) ─────────────────────────────────────────

function InlineAddFolder({ onAdd, onCancel }: {
  onAdd: (ref: string, name: string) => void;
  onCancel: () => void;
}) {
  const [ref, setRef]   = useState('');
  const [name, setName] = useState('');

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5">
      <input
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder="Ref"
        className="w-16 rounded border border-slate-200 px-1.5 py-0.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        autoFocus
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre de carpeta"
        onKeyDown={(e) => { if (e.key === 'Enter' && ref && name) onAdd(ref, name); }}
        className="flex-1 rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <button
        disabled={!ref.trim() || !name.trim()}
        onClick={() => onAdd(ref.trim(), name.trim())}
        className="rounded p-0.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button onClick={onCancel} className="rounded p-0.5 text-slate-400 hover:bg-slate-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Template editor modal ────────────────────────────────────────────────────

type EditorMode = 'create' | 'edit' | 'duplicate';

interface FolderEditModal {
  folder: FolderTemplate;
  phaseIdx: number;
  folderIdx: number;
  childIdx?: number;
}

function TemplateEditorModal({
  mode,
  initial,
  onSave,
  onClose,
}: {
  mode: EditorMode;
  initial?: IndexTemplate;
  onSave: (data: CreateTemplateData) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName]             = useState(
    mode === 'duplicate' ? `${initial?.name ?? ''} (copia)` : (initial?.name ?? ''),
  );
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isDefault, setIsDefault]   = useState(initial?.isDefault ?? false);
  const [structure, setStructure]   = useState<PhaseTemplate[]>(
    initial?.structure ? JSON.parse(JSON.stringify(initial.structure)) : IIA_STARTER,
  );
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  // Which phase is open in the editor
  const [openPhases, setOpenPhases] = useState<Set<number>>(new Set([0, 1, 2, 3]));
  // Inline add state: { phaseIdx, parentFolderIdx? }
  const [adding, setAdding]         = useState<{ phaseIdx: number; parentIdx?: number } | null>(null);
  // Edit folder modal
  const [editingFolder, setEditingFolder] = useState<FolderEditModal | null>(null);

  const togglePhase = (i: number) => {
    setOpenPhases((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  // ── Folder operations ──────────────────────────────────────────────────────

  const addRootFolder = (phaseIdx: number, ref: string, name: string) => {
    setStructure((s) => {
      const next = [...s];
      const phase = { ...next[phaseIdx], folders: [...next[phaseIdx].folders] };
      phase.folders.push({ ref, name, sortOrder: phase.folders.length });
      next[phaseIdx] = phase;
      return next;
    });
    setAdding(null);
  };

  const addChildFolder = (phaseIdx: number, parentIdx: number, ref: string, name: string) => {
    setStructure((s) => {
      const next = [...s];
      const phase   = { ...next[phaseIdx], folders: [...next[phaseIdx].folders] };
      const parent  = { ...phase.folders[parentIdx] };
      parent.children = [...(parent.children ?? []), { ref, name, sortOrder: (parent.children?.length ?? 0) }];
      phase.folders[parentIdx] = parent;
      next[phaseIdx] = phase;
      return next;
    });
    setAdding(null);
  };

  const deleteFolder = (phaseIdx: number, folderIdx: number, childIdx?: number) => {
    setStructure((s) => {
      const next  = [...s];
      const phase = { ...next[phaseIdx], folders: [...next[phaseIdx].folders] };
      if (childIdx !== undefined) {
        const parent   = { ...phase.folders[folderIdx] };
        parent.children = (parent.children ?? []).filter((_, i) => i !== childIdx);
        phase.folders[folderIdx] = parent;
      } else {
        phase.folders = phase.folders.filter((_, i) => i !== folderIdx);
      }
      next[phaseIdx] = phase;
      return next;
    });
  };

  const saveFolder = (ref: string, name: string) => {
    if (!editingFolder) return;
    const { phaseIdx, folderIdx, childIdx } = editingFolder;
    setStructure((s) => {
      const next  = [...s];
      const phase = { ...next[phaseIdx], folders: [...next[phaseIdx].folders] };
      if (childIdx !== undefined) {
        const parent   = { ...phase.folders[folderIdx] };
        const children = [...(parent.children ?? [])];
        children[childIdx] = { ...children[childIdx], ref, name };
        parent.children    = children;
        phase.folders[folderIdx] = parent;
      } else {
        phase.folders[folderIdx] = { ...phase.folders[folderIdx], ref, name };
      }
      next[phaseIdx] = phase;
      return next;
    });
    setEditingFolder(null);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!name.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({ name: name.trim(), description: description.trim() || undefined, isDefault, structure });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-800">
            {mode === 'create' ? 'Nueva plantilla de índice'
             : mode === 'duplicate' ? 'Duplicar plantilla'
             : 'Editar plantilla'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Nombre <span className="text-red-400">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej. Auditoría Financiera"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Descripción</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve descripción de uso"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded accent-blue-600"
            />
            Establecer como plantilla por defecto de la organización
          </label>

          {/* Structure editor */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Estructura de fases y carpetas
            </p>
            {structure.map((phase, phaseIdx) => {
              const cfg  = PHASE_CONFIG[phase.phaseType as PhaseType];
              const open = openPhases.has(phaseIdx);
              return (
                <div key={phase.phaseType} className={cn('rounded-xl border', cfg.border, cfg.bg)}>
                  {/* Phase header */}
                  <button
                    onClick={() => togglePhase(phaseIdx)}
                    className="flex w-full items-center gap-2 px-4 py-2.5"
                  >
                    {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                    <span className={cn('text-sm font-semibold', cfg.color)}>{phase.name}</span>
                    <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-slate-500">
                      {phase.folders.length} carpetas
                    </span>
                  </button>

                  {open && (
                    <div className="border-t border-white/60 bg-white/50 pb-1">
                      {phase.folders.map((folder, fi) => (
                        <div key={`${folder.ref}-${fi}`}>
                          <FolderEditorRow
                            folder={folder}
                            depth={0}
                            onEdit={(f) => {
                              const ci = folder.children?.indexOf(f);
                              if (ci !== undefined && ci >= 0) {
                                setEditingFolder({ folder: f, phaseIdx, folderIdx: fi, childIdx: ci });
                              } else {
                                setEditingFolder({ folder, phaseIdx, folderIdx: fi });
                              }
                            }}
                            onDelete={(f) => {
                              const ci = folder.children?.indexOf(f);
                              if (ci !== undefined && ci >= 0) deleteFolder(phaseIdx, fi, ci);
                              else deleteFolder(phaseIdx, fi);
                            }}
                            onAddChild={() => setAdding({ phaseIdx, parentIdx: fi })}
                          />
                          {/* Inline add sub-folder */}
                          {adding?.phaseIdx === phaseIdx && adding?.parentIdx === fi && (
                            <div style={{ paddingLeft: '26px' }}>
                              <InlineAddFolder
                                onAdd={(ref, name) => addChildFolder(phaseIdx, fi, ref, name)}
                                onCancel={() => setAdding(null)}
                              />
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Inline add root folder */}
                      {adding?.phaseIdx === phaseIdx && adding?.parentIdx === undefined ? (
                        <InlineAddFolder
                          onAdd={(ref, name) => addRootFolder(phaseIdx, ref, name)}
                          onCancel={() => setAdding(null)}
                        />
                      ) : (
                        <button
                          onClick={() => setAdding({ phaseIdx })}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                        >
                          <Plus className="h-3 w-3" /> Carpeta raíz
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar plantilla
          </button>
        </div>
      </div>

      {/* Edit folder dialog */}
      {editingFolder && (
        <EditFolderDialog
          folder={editingFolder.folder}
          onSave={saveFolder}
          onClose={() => setEditingFolder(null)}
        />
      )}
    </div>
  );
}

// ─── Edit folder dialog ───────────────────────────────────────────────────────

function EditFolderDialog({
  folder, onSave, onClose,
}: {
  folder: FolderTemplate;
  onSave: (ref: string, name: string) => void;
  onClose: () => void;
}) {
  const [ref, setRef]   = useState(folder.ref);
  const [name, setName] = useState(folder.name);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20">
      <div className="w-full max-w-xs rounded-xl bg-white p-5 shadow-xl">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">Editar carpeta</h3>
        <div className="space-y-2">
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="Ref"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            disabled={!ref.trim() || !name.trim()}
            onClick={() => { onSave(ref.trim(), name.trim()); onClose(); }}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onEdit,
  onDuplicate,
  onDelete,
  onSetDefault,
}: {
  template: IndexTemplate;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}) {
  const { phases, folders } = countStructure(template.structure);
  const setDefault = useSetDefaultTemplate();

  return (
    <div className={cn(
      'rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md',
      template.isDefault ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-800">{template.name}</h3>
            {template.isDefault && (
              <span className="shrink-0 flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                <Star className="h-2.5 w-2.5" /> Default
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

      {/* Stats */}
      <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
        <span>{phases} fases</span>
        <span>·</span>
        <span>{folders} carpetas</span>
      </div>

      {/* Phase dots */}
      <div className="mt-2 flex gap-1">
        {template.structure.map((p) => {
          const cfg = PHASE_CONFIG[p.phaseType as PhaseType];
          return (
            <div key={p.phaseType} title={p.name}
              className={cn('h-1.5 flex-1 rounded-full', cfg.bg.replace('bg-', 'bg-').replace('-50', '-200'))}>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-1.5">
        {!template.isDefault && (
          <button
            onClick={onSetDefault}
            disabled={setDefault.isPending}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
          >
            <Star className="h-3 w-3" /> Predeterminar
          </button>
        )}
        <button
          onClick={onDuplicate}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
        >
          <Copy className="h-3 w-3" /> Duplicar
        </button>
        {!template.isSystem && (
          <button
            onClick={onEdit}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50"
          >
            <Pencil className="h-3 w-3" /> Editar
          </button>
        )}
        {!template.isSystem && !template.isDefault && (
          <button
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
  | { mode: 'edit';      template: IndexTemplate }
  | { mode: 'duplicate'; template: IndexTemplate }
  | null;

export default function IndexTemplatesPage() {
  const { data: templates, isLoading } = useIndexTemplates();
  const createTemplate  = useCreateIndexTemplate();
  const updateTemplate  = useUpdateIndexTemplate();
  const deleteTemplate  = useDeleteIndexTemplate();
  const setDefault      = useSetDefaultTemplate();

  const [modal, setModal] = useState<ModalState>(null);

  const handleSave = async (data: CreateTemplateData) => {
    if (modal?.mode === 'edit') {
      await updateTemplate.mutateAsync({ id: modal.template.id, data });
    } else {
      await createTemplate.mutateAsync(data);
    }
  };

  const handleDelete = (tpl: IndexTemplate) => {
    if (!confirm(`¿Eliminar la plantilla "${tpl.name}"?`)) return;
    deleteTemplate.mutate(tpl.id);
  };

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Plantillas de Índice"
        breadcrumbs={[
          { label: 'Administración' },
          { label: 'Plantillas de Índice' },
        ]}
      />

      {/* Sub-header with description + action */}
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3">
        <p className="text-sm text-slate-500">
          Define las estructuras de fases y carpetas que se cargan al inicializar un expediente
        </p>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Nueva plantilla
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : !templates?.length ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <Settings2 className="h-8 w-8 text-slate-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-700">Sin plantillas</p>
              <p className="mt-1 text-sm text-slate-500">
                La plantilla IIA Estándar se crea automáticamente.<br />
                Actualiza esta página o crea una nueva.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onEdit={() => setModal({ mode: 'edit', template: tpl })}
                onDuplicate={() => setModal({ mode: 'duplicate', template: tpl })}
                onDelete={() => handleDelete(tpl)}
                onSetDefault={() => setDefault.mutate(tpl.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Editor modal */}
      {modal && (
        <TemplateEditorModal
          mode={modal.mode}
          initial={'template' in modal ? modal.template : undefined}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
