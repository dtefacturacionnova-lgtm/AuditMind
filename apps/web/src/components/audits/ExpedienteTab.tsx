'use client';
import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  FolderOpen, FolderPlus, Folder, FileText, Plus, ChevronRight, ChevronDown,
  MoreHorizontal, Pencil, Trash2, CheckCircle2, Lock, AlertCircle, Clock,
  Loader2, FilePlus, Upload, X, Music, Image as ImageIcon, FileSpreadsheet,
  Presentation, File, Star, Settings2,
} from 'lucide-react';
import {
  useExpediente, useInitializeExpediente, useCreateFolder,
  useUpdateFolder, useDeleteFolder, useSignOffPhase, useUploadFileToFolder,
  AuditPhase, AuditFolder, WpStub, PHASE_CONFIG, PHASE_STATUS_CONFIG,
} from '@/hooks/useExpediente';
import { WP_STATUS_CONFIG, type WpStatus } from '@/hooks/useWorkingPapers';
import { useIndexTemplates, type IndexTemplate } from '@/hooks/useIndexTemplates';
import { cn } from '@/lib/utils';

// ─── Helpers de archivo ───────────────────────────────────────────────────────

const MIME_ICONS: { test: (m: string) => boolean; icon: React.ElementType; color: string; label: string }[] = [
  { test: (m) => m.includes('spreadsheet') || m.includes('excel') || m.includes('.xls'),
    icon: FileSpreadsheet, color: 'text-emerald-600', label: 'Excel' },
  { test: (m) => m.includes('presentation') || m.includes('powerpoint'),
    icon: Presentation, color: 'text-orange-500', label: 'PPT' },
  { test: (m) => m.startsWith('audio/'),
    icon: Music, color: 'text-purple-500', label: 'Audio' },
  { test: (m) => m.startsWith('image/'),
    icon: ImageIcon, color: 'text-pink-500', label: 'Imagen' },
  { test: (m) => m === 'application/pdf',
    icon: FileText, color: 'text-red-500', label: 'PDF' },
  { test: (m) => m.includes('word') || m.includes('document'),
    icon: FileText, color: 'text-blue-600', label: 'Word' },
];

function getMimeInfo(mimeType?: string) {
  if (!mimeType) return { icon: File, color: 'text-slate-400', label: 'Archivo' };
  const found = MIME_ICONS.find(({ test }) => test(mimeType));
  return found ?? { icon: File, color: 'text-slate-400', label: 'Archivo' };
}

function formatBytes(b?: number) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Fila de papel/archivo dentro de una carpeta ─────────────────────────────

function PaperRow({ paper, depth }: { paper: WpStub; depth: number }) {
  const mimeInfo  = getMimeInfo(paper.mimeType);
  const IconComp  = paper.wpKind === 'FILE' ? mimeInfo.icon : FileText;
  const iconColor = paper.wpKind === 'FILE' ? mimeInfo.color : 'text-blue-400';
  const st        = WP_STATUS_CONFIG[paper.status as WpStatus];

  return (
    <Link
      href={`/dashboard/working-papers/${paper.id}`}
      className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-blue-50 transition-colors"
      style={{ paddingLeft: `${8 + (depth + 1) * 20}px` }}
    >
      <IconComp className={cn('h-3.5 w-3.5 shrink-0', iconColor)} />
      {paper.ref && (
        <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-500">
          {paper.ref}
        </span>
      )}
      <span className="flex-1 truncate text-xs text-slate-600 group-hover:text-blue-700">
        {paper.title}
      </span>
      {paper.wpKind === 'FILE' && paper.mimeType && (
        <span className={cn('shrink-0 text-[10px] font-medium', mimeInfo.color)}>
          {mimeInfo.label}
        </span>
      )}
      {st && (
        <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium', st.bg, st.color)}>
          {st.label}
        </span>
      )}
    </Link>
  );
}

// ─── Fila de carpeta ──────────────────────────────────────────────────────────

function FolderRow({
  folder,
  depth = 0,
  auditId,
  onAddChild,
  onEdit,
  onDelete,
  onAddPaper,
  onUploadFile,
}: {
  folder: AuditFolder;
  depth?: number;
  auditId: string;
  onAddChild: (parentId: string, phaseId?: string) => void;
  onEdit: (folder: AuditFolder) => void;
  onDelete: (folder: AuditFolder) => void;
  onAddPaper: (folderId: string) => void;
  onUploadFile: (folderId: string) => void;
}) {
  const [open, setOpen]         = useState(depth === 0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addMenu, setAddMenu]   = useState(false);

  const hasChildren = folder.children && folder.children.length > 0;
  const papers      = folder.papers ?? [];
  const hasPapers   = papers.length > 0;
  const paperCount  = papers.length;
  const isExpanded  = open && (hasChildren || hasPapers);

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
          {hasChildren || hasPapers ? (
            open
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <span className="inline-block w-3.5" />
          )}
        </button>

        {/* Folder icon */}
        {isExpanded
          ? <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
          : <Folder    className="h-4 w-4 shrink-0 text-amber-400" />
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

        {/* Actions (on hover) */}
        <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          {/* Sub-carpeta */}
          {depth < 2 && (
            <button
              onClick={() => onAddChild(folder.id, folder.phaseId)}
              title="Sub-carpeta"
              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Agregar papel/archivo — mini menú */}
          <div className="relative">
            <button
              onClick={() => setAddMenu(!addMenu)}
              title="Agregar papel o archivo"
              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            {addMenu && (
              <div className="absolute right-0 top-6 z-50 min-w-[170px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                  onClick={() => { onAddPaper(folder.id); setAddMenu(false); }}
                >
                  <FilePlus className="h-3.5 w-3.5 text-blue-500" />
                  Papel inteligente
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                  onClick={() => { onUploadFile(folder.id); setAddMenu(false); }}
                >
                  <Upload className="h-3.5 w-3.5 text-emerald-500" />
                  Subir archivo
                </button>
              </div>
            )}
          </div>

          {/* Menú carpeta (renombrar / eliminar) */}
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

      {/* Children (sub-carpetas) */}
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
              onUploadFile={onUploadFile}
            />
          ))}
        </div>
      )}

      {/* Papers en esta carpeta */}
      {open && hasPapers && (
        <div>
          {papers.map((p) => (
            <PaperRow key={p.id} paper={p} depth={depth} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal crear/renombrar carpeta ────────────────────────────────────────────

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
  const [ref, setRef]   = useState(initialRef ?? '');
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

// ─── Modal subir archivo ──────────────────────────────────────────────────────

const ACCEPTED_TYPES =
  '.docx,.doc,.xlsx,.xls,.pptx,.ppt,.pdf,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.m4a,.ogg';

function UploadModal({
  folderId,
  auditId,
  onClose,
}: {
  folderId: string;
  auditId: string;
  onClose: () => void;
}) {
  const [file, setFile]           = useState<File | null>(null);
  const [title, setTitle]         = useState('');
  const [ref, setRef]             = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef                  = useRef<HTMLInputElement>(null);
  const upload = useUploadFileToFolder(auditId);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
  }, [title]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async () => {
    if (!file || !title.trim()) return;
    try {
      await upload.mutateAsync({ folderId, file, title: title.trim(), ref: ref.trim() || undefined });
      onClose();
    } catch { /* error shown inline */ }
  };

  const mimeInfo = getMimeInfo(file?.type);
  const IconComp = mimeInfo.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">Subir archivo al expediente</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors',
              isDragging
                ? 'border-blue-400 bg-blue-50'
                : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50',
            )}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={ACCEPTED_TYPES}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {file ? (
              <>
                <IconComp className={cn('h-10 w-10', mimeInfo.color)} />
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-700">{file.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {mimeInfo.label} · {formatBytes(file.size)}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); setTitle(''); }}
                  className="text-xs text-slate-400 hover:text-red-500 underline"
                >
                  Cambiar archivo
                </button>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-slate-300" />
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-600">
                    Arrastra un archivo o haz clic aquí
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Word, Excel, PowerPoint, PDF, Imagen, Audio
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Campos */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Título del papel <span className="text-red-400">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nombre descriptivo del papel de trabajo"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Referencia{' '}
              <span className="font-normal text-slate-400">(opcional — ej. A-01, B-2.1)</span>
            </label>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="A-01"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Progress */}
          {upload.isPending && (
            <div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full animate-pulse bg-blue-500 rounded-full" style={{ width: '70%' }} />
              </div>
              <p className="mt-1 text-center text-xs text-slate-500">Subiendo a Supabase Storage…</p>
            </div>
          )}

          {/* Error */}
          {upload.isError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {(upload.error as Error).message}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            disabled={upload.isPending}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            disabled={!file || !title.trim() || upload.isPending}
            onClick={handleSubmit}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {upload.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Upload  className="h-4 w-4" />
            }
            Subir archivo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Phase status icon ────────────────────────────────────────────────────────

function PhaseStatusIcon({ status }: { status: AuditPhase['status'] }) {
  if (status === 'COMPLETE')    return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === 'LOCKED')      return <Lock         className="h-4 w-4 text-gray-400" />;
  if (status === 'IN_PROGRESS') return <Clock        className="h-4 w-4 text-amber-500" />;
  return <AlertCircle className="h-4 w-4 text-gray-400" />;
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface ExpedienteTabProps {
  auditId: string;
  auditTitle: string;
  onOpenPaper?: (paperId: string) => void;
  onCreatePaper?: (folderId: string) => void;
}

export function ExpedienteTab({ auditId, onCreatePaper }: ExpedienteTabProps) {
  const { data: phases, isLoading } = useExpediente(auditId);
  const initMutation = useInitializeExpediente(auditId);
  const createFolder = useCreateFolder(auditId);
  const updateFolder = useUpdateFolder(auditId);
  const deleteFolder = useDeleteFolder(auditId);
  const signOff      = useSignOffPhase(auditId);
  const { data: templates } = useIndexTemplates();

  // Modal state
  const [folderModal, setFolderModal] = useState<{
    mode: 'create' | 'edit';
    parentId?: string;
    phaseId?: string;
    folder?: AuditFolder;
  } | null>(null);

  const [uploadFolderId, setUploadFolderId]       = useState<string | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAddRootFolder = (phaseId: string) => setFolderModal({ mode: 'create', phaseId });

  const handleAddChild = (parentId: string, phaseId?: string) =>
    setFolderModal({ mode: 'create', parentId, phaseId });

  const handleEdit   = (folder: AuditFolder) => setFolderModal({ mode: 'edit', folder });

  const handleDelete = async (folder: AuditFolder) => {
    if (!confirm(`¿Eliminar carpeta "${folder.ref} — ${folder.name}"?`)) return;
    deleteFolder.mutate(folder.id);
  };

  const handleFolderModalSave = async (ref: string, name: string) => {
    if (!folderModal) return;
    if (folderModal.mode === 'create') {
      await createFolder.mutateAsync({
        ref, name,
        phaseId: folderModal.phaseId,
        parentId: folderModal.parentId,
      });
    } else if (folderModal.mode === 'edit' && folderModal.folder) {
      await updateFolder.mutateAsync({
        folderId: folderModal.folder.id,
        data: { ref, name },
      });
    }
    setFolderModal(null);
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  // ── Empty state + template picker ────────────────────────────────────────

  if (!phases || phases.length === 0) {
    const hasMultiple = (templates?.length ?? 0) > 1;
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
          <FolderOpen className="h-8 w-8 text-blue-400" />
        </div>
        <div>
          <p className="text-base font-semibold text-slate-800">Expediente vacío</p>
          <p className="mt-1 text-sm text-slate-500">
            Selecciona una plantilla de índice para inicializar<br />
            la estructura de fases y carpetas del expediente.
          </p>
        </div>

        {showTemplatePicker && hasMultiple ? (
          <div className="w-full max-w-sm space-y-2 text-left">
            <p className="text-xs font-medium text-slate-600 text-center">Selecciona una plantilla:</p>
            {templates!.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => { initMutation.mutate(tpl.id); setShowTemplatePicker(false); }}
                disabled={initMutation.isPending}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-4 py-3 hover:bg-blue-50 disabled:opacity-60 transition-colors',
                  tpl.isDefault ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white',
                )}
              >
                <Settings2 className="h-5 w-5 shrink-0 text-blue-400" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-800">{tpl.name}</span>
                    {tpl.isDefault && <Star className="h-3 w-3 text-amber-400 fill-amber-400" />}
                  </div>
                  {tpl.description && (
                    <p className="truncate text-xs text-slate-500">{tpl.description}</p>
                  )}
                </div>
              </button>
            ))}
            <button
              onClick={() => setShowTemplatePicker(false)}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600 py-1"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => { if (hasMultiple) setShowTemplatePicker(true); else initMutation.mutate(undefined); }}
            disabled={initMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {initMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <FolderPlus className="h-4 w-4" />
            }
            {hasMultiple ? 'Elegir plantilla e inicializar' : 'Inicializar expediente'}
          </button>
        )}
      </div>
    );
  }

  // ── Árbol del expediente ──────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {phases.map((phase) => {
        const cfg    = PHASE_CONFIG[phase.phaseType];
        const stCfg  = PHASE_STATUS_CONFIG[phase.status];

        // Contar carpetas y papeles (recursivo hasta nivel 2)
        const totalFolders = phase.folders.reduce(
          (acc, f) => acc + 1 + (f.children?.length ?? 0),
          0,
        );
        const countPapers = (f: AuditFolder): number => {
          const own = f.papers?.length ?? 0;
          const ch  = (f.children ?? []).reduce((s, c) => s + countPapers(c), 0);
          return own + ch;
        };
        const totalPapers = phase.folders.reduce((acc, f) => acc + countPapers(f), 0);

        return (
          <div key={phase.id} className={cn('rounded-xl border', cfg.border, cfg.bg)}>
            {/* Phase header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <PhaseStatusIcon status={phase.status} />
                <span className={cn('text-sm font-semibold', cfg.color)}>{phase.name}</span>
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
                  <span className="text-xs text-slate-500">✓ {phase.signedOffBy.name}</span>
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
                    onUploadFile={(folderId) => setUploadFolderId(folderId)}
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
      {folderModal && (
        <FolderModal
          title={folderModal.mode === 'create' ? 'Nueva carpeta' : 'Renombrar carpeta'}
          initialRef={folderModal.folder?.ref}
          initialName={folderModal.folder?.name}
          onSave={handleFolderModalSave}
          onClose={() => setFolderModal(null)}
        />
      )}

      {/* Modal subir archivo */}
      {uploadFolderId && (
        <UploadModal
          folderId={uploadFolderId}
          auditId={auditId}
          onClose={() => setUploadFolderId(null)}
        />
      )}
    </div>
  );
}
