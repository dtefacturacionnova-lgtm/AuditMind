'use client';
import { useState } from 'react';
import {
  FolderOpen, FolderPlus, Folder, FileText, Plus, ChevronRight, ChevronDown,
  MoreHorizontal, Pencil, Trash2, CheckCircle2, Lock, AlertCircle, Clock,
  Loader2, FilePlus,
} from 'lucide-react';
import {
  useExpediente, useInitializeExpediente, useCreateFolder,
  useUpdateFolder, useDeleteFolder, useSignOffPhase,
  AuditPhase, AuditFolder, PHASE_CONFIG, PHASE_STATUS_CONFIG,
} from '@/hooks/useExpediente';
import { cn } from '@/lib/utils';

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function PhaseStatusIcon({ status }: { status: AuditPhase['status'] }) {
  if (status === 'COMPLETE') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === 'LOCKED')   return <Lock className="h-4 w-4 text-gray-400" />;
  if (status === 'IN_PROGRESS') return <Clock className="h-4 w-4 text-amber-500" />;
  return <AlertCircle className="h-4 w-4 text-gray-400" />;
}

function FolderRow({
  folder,
  depth = 0,
  auditId,
  onAddChild,
  onEdit,
  onDelete,
  onAddPaper,
}: {
  folder: AuditFolder;
  depth?: number;
  auditId: string;
  onAddChild: (parentId: string, phaseId?: string) => void;
  onEdit: (folder: AuditFolder) => void;
  onDelete: (folder: AuditFolder) => void;
  onAddPaper: (folderId: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasChildren = folder.children && folder.children.length > 0;
  const paperCount = folder._count?.papers ?? 0;

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-slate-50 transition-colors',
          depth === 0 && 'font-medium',
        )}
        style={{ paddingLeft: `${8 + depth * 20}px` }}
      >
        {/* Expand toggle */}
        <button
          onClick={() => setOpen(!open)}
          className="shrink-0 text-slate-400 hover:text-slate-600"
        >
          {hasChildren ? (
            open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <span className="w-3.5 inline-block" />
          )}
        </button>

        {/* Icon */}
        {open && hasChildren
          ? <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
          : <Folder className="h-4 w-4 shrink-0 text-amber-400" />
        }

        {/* Ref */}
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
          {folder.ref}
        </span>

        {/* Name */}
        <span className="flex-1 truncate text-sm text-slate-700">{folder.name}</span>

        {/* Paper count badge */}
        {paperCount > 0 && (
          <span className="shrink-0 rounded-full bg-blue-100 px-1.5 text-[11px] font-medium text-blue-700">
            {paperCount}
          </span>
        )}

        {/* Actions (hover) */}
        <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          {depth < 2 && (
            <button
              onClick={() => onAddChild(folder.id, folder.phaseId)}
              title="Agregar sub-carpeta"
              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => onAddPaper(folder.id)}
            title="Agregar papel"
            className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-6 z-50 min-w-[130px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => { onEdit(folder); setMenuOpen(false); }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Renombrar
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                  onClick={() => { onDelete(folder); setMenuOpen(false); }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Children */}
      {open && hasChildren && (
        <div>
          {folder.children.map((child) => (
            <FolderRow
              key={child.id}
              folder={child}
              depth={depth + 1}
              auditId={auditId}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddPaper={onAddPaper}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal simple para crear/renombrar carpeta ────────────────────────────────

function FolderModal({
  title,
  initialRef,
  initialName,
  onSave,
  onClose,
}: {
  title: string;
  initialRef?: string;
  initialName?: string;
  onSave: (ref: string, name: string) => void;
  onClose: () => void;
}) {
  const [ref, setRef] = useState(initialRef ?? '');
  const [name, setName] = useState(initialName ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-base font-semibold text-slate-800">{title}</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Referencia</label>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="A-1, B-2, C-1.1..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la carpeta"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            disabled={!ref.trim() || !name.trim()}
            onClick={() => onSave(ref.trim(), name.trim())}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface ExpedienteTabProps {
  auditId: string;
  auditTitle: string;
  onOpenPaper?: (paperId: string) => void;
  onCreatePaper?: (folderId: string) => void;
}

export function ExpedienteTab({ auditId, auditTitle, onCreatePaper }: ExpedienteTabProps) {
  const { data: phases, isLoading } = useExpediente(auditId);
  const initMutation  = useInitializeExpediente(auditId);
  const createFolder  = useCreateFolder(auditId);
  const updateFolder  = useUpdateFolder(auditId);
  const deleteFolder  = useDeleteFolder(auditId);
  const signOff       = useSignOffPhase(auditId);

  // Modal state
  const [modal, setModal] = useState<{
    mode: 'create' | 'edit';
    parentId?: string;
    phaseId?: string;
    folder?: AuditFolder;
  } | null>(null);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAddRootFolder = (phaseId: string) => {
    setModal({ mode: 'create', phaseId });
  };

  const handleAddChild = (parentId: string, phaseId?: string) => {
    setModal({ mode: 'create', parentId, phaseId });
  };

  const handleEdit = (folder: AuditFolder) => {
    setModal({ mode: 'edit', folder });
  };

  const handleDelete = async (folder: AuditFolder) => {
    if (!confirm(`¿Eliminar carpeta "${folder.ref} — ${folder.name}"?`)) return;
    deleteFolder.mutate(folder.id);
  };

  const handleModalSave = async (ref: string, name: string) => {
    if (!modal) return;
    if (modal.mode === 'create') {
      await createFolder.mutateAsync({
        ref, name,
        phaseId: modal.phaseId,
        parentId: modal.parentId,
      });
    } else if (modal.mode === 'edit' && modal.folder) {
      await updateFolder.mutateAsync({ folderId: modal.folder.id, data: { ref, name } });
    }
    setModal(null);
  };

  // ── Render vacío ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!phases || phases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
          <FolderOpen className="h-8 w-8 text-blue-400" />
        </div>
        <div>
          <p className="text-base font-semibold text-slate-800">Expediente vacío</p>
          <p className="mt-1 text-sm text-slate-500">
            Inicializa el expediente con la plantilla estándar IIA<br />
            o crea las fases y carpetas manualmente.
          </p>
        </div>
        <button
          onClick={() => initMutation.mutate()}
          disabled={initMutation.isPending}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {initMutation.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <FolderPlus className="h-4 w-4" />
          }
          Inicializar con plantilla estándar
        </button>
      </div>
    );
  }

  // ── Render árbol ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {phases.map((phase) => {
        const cfg = PHASE_CONFIG[phase.phaseType];
        const stCfg = PHASE_STATUS_CONFIG[phase.status];
        const totalFolders = phase.folders.reduce((acc, f) => acc + 1 + (f.children?.length ?? 0), 0);
        const totalPapers = phase.folders.reduce((acc, f) => {
          let count = f._count?.papers ?? 0;
          f.children?.forEach((c) => { count += c._count?.papers ?? 0; });
          return acc + count;
        }, 0);

        return (
          <div
            key={phase.id}
            className={cn('rounded-xl border', cfg.border, cfg.bg)}
          >
            {/* Phase header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <PhaseStatusIcon status={phase.status} />
                <span className={cn('text-sm font-semibold', cfg.color)}>
                  {phase.name}
                </span>
                <span className={cn('text-xs', stCfg.color)}>— {stCfg.label}</span>
                <span className="rounded bg-white/70 px-1.5 py-0.5 text-[11px] text-slate-500">
                  {totalFolders} carpetas · {totalPapers} papeles
                </span>
              </div>
              <div className="flex items-center gap-2">
                {phase.status !== 'COMPLETE' && phase.status !== 'LOCKED' && (
                  <>
                    <button
                      onClick={() => handleAddRootFolder(phase.id)}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-slate-600 hover:bg-white/70"
                    >
                      <FolderPlus className="h-3.5 w-3.5" /> Carpeta
                    </button>
                    <button
                      onClick={() => signOff.mutate(phase.id)}
                      disabled={signOff.isPending}
                      className="flex items-center gap-1 rounded-lg border border-current px-2.5 py-1 text-xs text-emerald-700 hover:bg-white/70"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Cerrar fase
                    </button>
                  </>
                )}
                {phase.status === 'COMPLETE' && phase.signedOffBy && (
                  <span className="text-xs text-slate-500">
                    ✓ {phase.signedOffBy.name}
                  </span>
                )}
              </div>
            </div>

            {/* Folder tree */}
            {phase.folders.length > 0 ? (
              <div className="border-t border-white/60 bg-white/50 py-1">
                {phase.folders.map((folder) => (
                  <FolderRow
                    key={folder.id}
                    folder={folder}
                    depth={0}
                    auditId={auditId}
                    onAddChild={handleAddChild}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onAddPaper={(folderId) => onCreatePaper?.(folderId)}
                  />
                ))}
              </div>
            ) : (
              <div className="border-t border-white/60 py-4 text-center text-sm text-slate-400">
                Sin carpetas — usa el botón "Carpeta" para agregar
              </div>
            )}
          </div>
        );
      })}

      {/* Modal crear/editar carpeta */}
      {modal && (
        <FolderModal
          title={modal.mode === 'create' ? 'Nueva carpeta' : 'Renombrar carpeta'}
          initialRef={modal.folder?.ref}
          initialName={modal.folder?.name}
          onSave={handleModalSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
