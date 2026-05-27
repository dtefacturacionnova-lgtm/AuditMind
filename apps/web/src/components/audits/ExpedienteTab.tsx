'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  FolderOpen, FolderPlus, Folder, FileText, Plus, ChevronRight, ChevronDown,
  MoreHorizontal, Pencil, Trash2, CheckCircle2, Lock, AlertCircle, Clock,
  Loader2, FilePlus, Upload, X, Music, Image as ImageIcon, FileSpreadsheet,
  Presentation, File, Star, Settings2, Download, ExternalLink,
} from 'lucide-react';
import {
  useExpediente, useInitializeExpediente, useCreateFolder,
  useUpdateFolder, useDeleteFolder, useSignOffPhase, useUploadFileToFolder,
  AuditPhase, AuditFolder, WpStub, PHASE_CONFIG, PHASE_STATUS_CONFIG,
} from '@/hooks/useExpediente';
import { WP_STATUS_CONFIG, type WpStatus } from '@/hooks/useWorkingPapers';
import { useIndexTemplates } from '@/hooks/useIndexTemplates';
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

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

// Badge config por tipo de papel
const WP_KIND_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  FILE:     { label: 'Archivo',     bg: 'bg-slate-100',   color: 'text-slate-600' },
  SMART:    { label: 'Inteligente', bg: 'bg-blue-100',    color: 'text-blue-700' },
  STANDARD: { label: 'Estándar',    bg: 'bg-indigo-50',   color: 'text-indigo-700' },
  MASTER:   { label: 'Maestro',     bg: 'bg-purple-100',  color: 'text-purple-700' },
  LIVE:     { label: 'En Vivo',     bg: 'bg-emerald-100', color: 'text-emerald-700' },
};

// ─── Helpers árbol ────────────────────────────────────────────────────────────

function findFolderInTree(folders: AuditFolder[], id: string): AuditFolder | null {
  for (const f of folders) {
    if (f.id === id) return f;
    const found = findFolderInTree(f.children ?? [], id);
    if (found) return found;
  }
  return null;
}

function findFolderById(phases: AuditPhase[], id: string): AuditFolder | null {
  for (const phase of phases) {
    const found = findFolderInTree(phase.folders, id);
    if (found) return found;
  }
  return null;
}

function findPhaseForFolder(phases: AuditPhase[], folderId: string): AuditPhase | null {
  for (const phase of phases) {
    if (findFolderInTree(phase.folders, folderId)) return phase;
  }
  return null;
}

// ─── Phase status icon ────────────────────────────────────────────────────────

function PhaseStatusIcon({ status }: { status: AuditPhase['status'] }) {
  if (status === 'COMPLETE')    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === 'LOCKED')      return <Lock         className="h-3.5 w-3.5 text-gray-400" />;
  if (status === 'IN_PROGRESS') return <Clock        className="h-3.5 w-3.5 text-amber-500" />;
  return <AlertCircle className="h-3.5 w-3.5 text-gray-400" />;
}

// ─── TreeFolderRow — panel izquierdo (sin papeles inline) ────────────────────

function TreeFolderRow({
  folder,
  depth,
  selectedFolderId,
  onSelect,
  onAddChild,
  onEdit,
  onDelete,
}: {
  folder: AuditFolder;
  depth: number;
  selectedFolderId: string | null;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string, phaseId?: string) => void;
  onEdit: (folder: AuditFolder) => void;
  onDelete: (folder: AuditFolder) => void;
}) {
  const [open, setOpen]         = useState(depth === 0);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasChildren = (folder.children?.length ?? 0) > 0;
  const isSelected  = selectedFolderId === folder.id;
  const paperCount  = folder.papers?.length ?? 0;

  return (
    <div>
      <div
        className={cn(
          'group flex cursor-pointer items-center gap-1 rounded-md transition-colors',
          isSelected ? 'bg-blue-100' : 'hover:bg-slate-100',
        )}
        style={{
          paddingLeft: `${8 + depth * 16}px`,
          paddingRight: '6px',
          paddingTop: '5px',
          paddingBottom: '5px',
        }}
        onClick={() => onSelect(folder.id)}
      >
        {/* Chevron para expandir/colapsar */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-600"
        >
          {hasChildren
            ? (open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)
            : <span className="inline-block w-3" />
          }
        </button>

        {/* Icono de carpeta */}
        {open && hasChildren
          ? <FolderOpen className={cn('h-3.5 w-3.5 shrink-0', isSelected ? 'text-blue-600' : 'text-amber-500')} />
          : <Folder     className={cn('h-3.5 w-3.5 shrink-0', isSelected ? 'text-blue-500' : 'text-amber-400')} />
        }

        {/* Referencia */}
        <span className={cn(
          'shrink-0 rounded px-1 py-0.5 font-mono text-[10px]',
          isSelected ? 'bg-blue-200 text-blue-800' : 'bg-slate-100 text-slate-500',
        )}>
          {folder.ref}
        </span>

        {/* Nombre */}
        <span className={cn(
          'flex-1 truncate text-xs',
          isSelected ? 'font-semibold text-blue-700' : 'text-slate-600',
        )}>
          {folder.name}
        </span>

        {/* Badge de cantidad de papeles */}
        {paperCount > 0 && (
          <span className={cn(
            'shrink-0 rounded-full px-1.5 text-[10px] font-medium',
            isSelected ? 'bg-blue-200 text-blue-700' : 'bg-blue-100 text-blue-600',
          )}>
            {paperCount}
          </span>
        )}

        {/* Acciones al pasar el cursor */}
        <div
          className="hidden items-center gap-0.5 group-hover:flex"
          onClick={(e) => e.stopPropagation()}
        >
          {depth < 2 && (
            <button
              type="button"
              onClick={() => onAddChild(folder.id, folder.phaseId)}
              title="Agregar sub-carpeta"
              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              <FolderPlus className="h-3 w-3" />
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-5 z-50 min-w-[130px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                  onClick={() => { onEdit(folder); setMenuOpen(false); }}
                >
                  <Pencil className="h-3 w-3" /> Renombrar
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  onClick={() => { onDelete(folder); setMenuOpen(false); }}
                >
                  <Trash2 className="h-3 w-3" /> Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub-carpetas */}
      {open && hasChildren && (
        <div>
          {folder.children.map((child) => (
            <TreeFolderRow
              key={child.id}
              folder={child}
              depth={depth + 1}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PaperTableRow — fila de la tabla del panel derecho ──────────────────────

function PaperTableRow({ paper }: { paper: WpStub }) {
  const mimeInfo  = getMimeInfo(paper.mimeType);
  const IconComp  = paper.wpKind === 'FILE' ? mimeInfo.icon : FileText;
  const iconColor = paper.wpKind === 'FILE' ? mimeInfo.color : 'text-blue-500';
  const st        = WP_STATUS_CONFIG[paper.status as WpStatus];
  const kindCfg   = WP_KIND_CONFIG[paper.wpKind] ?? WP_KIND_CONFIG.STANDARD;

  return (
    <tr className="group border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
      {/* Icono de tipo */}
      <td className="w-9 py-3 pl-5 pr-2">
        <IconComp className={cn('h-4 w-4', iconColor)} />
      </td>

      {/* Referencia */}
      <td className="w-20 px-2 py-3">
        {paper.ref && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
            {paper.ref}
          </span>
        )}
      </td>

      {/* Título + nombre original */}
      <td className="min-w-0 px-2 py-3">
        <div className="min-w-0">
          <Link
            href={`/dashboard/working-papers/${paper.id}`}
            className="block truncate text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors"
          >
            {paper.title}
          </Link>
          {paper.originalFilename && (
            <span className="block truncate text-[10px] text-slate-400 mt-0.5">
              {paper.originalFilename}
            </span>
          )}
        </div>
      </td>

      {/* Tipo de papel */}
      <td className="w-28 px-2 py-3">
        <span className={cn(
          'whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium',
          kindCfg.bg, kindCfg.color,
        )}>
          {kindCfg.label}
        </span>
      </td>

      {/* Estado */}
      <td className="w-28 px-2 py-3">
        {st && (
          <span className={cn(
            'whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium',
            st.bg, st.color,
          )}>
            {st.label}
          </span>
        )}
      </td>

      {/* Fecha */}
      <td className="w-28 whitespace-nowrap px-2 py-3 text-xs text-slate-400">
        {formatDate(paper.createdAt)}
      </td>

      {/* Acciones */}
      <td className="w-16 py-3 pl-2 pr-5">
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Link
            href={`/dashboard/working-papers/${paper.id}`}
            title="Abrir"
            className="rounded p-1 text-slate-400 transition-colors hover:bg-blue-100 hover:text-blue-600"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          {paper.fileUrl && (
            <a
              href={paper.fileUrl}
              download
              title="Descargar"
              className="rounded p-1 text-slate-400 transition-colors hover:bg-emerald-100 hover:text-emerald-600"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </td>
    </tr>
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
  const [file, setFile]             = useState<File | null>(null);
  const [title, setTitle]           = useState('');
  const [ref, setRef]               = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef                    = useRef<HTMLInputElement>(null);
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

        <div className="space-y-4 p-6">
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
                  <p className="mt-0.5 text-xs text-slate-400">
                    {mimeInfo.label} · {formatBytes(file.size)}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); setTitle(''); }}
                  className="text-xs text-slate-400 underline hover:text-red-500"
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
                  <p className="mt-0.5 text-xs text-slate-400">
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

          {/* Progreso */}
          {upload.isPending && (
            <div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full animate-pulse rounded-full bg-blue-500" style={{ width: '70%' }} />
              </div>
              <p className="mt-1 text-center text-xs text-slate-500">Subiendo archivo al servidor…</p>
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

  // Panel split
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Modal state
  const [folderModal, setFolderModal] = useState<{
    mode: 'create' | 'edit';
    parentId?: string;
    phaseId?: string;
    folder?: AuditFolder;
  } | null>(null);

  const [uploadFolderId, setUploadFolderId]       = useState<string | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // Auto-seleccionar la primera carpeta disponible
  useEffect(() => {
    if (!selectedFolderId && phases && phases.length > 0) {
      for (const phase of phases) {
        if (phase.folders.length > 0) {
          setSelectedFolderId(phase.folders[0].id);
          break;
        }
      }
    }
  }, [phases, selectedFolderId]);

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
            <p className="text-center text-xs font-medium text-slate-600">Selecciona una plantilla:</p>
            {templates!.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => { initMutation.mutate(tpl.id); setShowTemplatePicker(false); }}
                disabled={initMutation.isPending}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-4 py-3 transition-colors hover:bg-blue-50 disabled:opacity-60',
                  tpl.isDefault ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white',
                )}
              >
                <Settings2 className="h-5 w-5 shrink-0 text-blue-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-800">{tpl.name}</span>
                    {tpl.isDefault && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                  </div>
                  {tpl.description && (
                    <p className="truncate text-xs text-slate-500">{tpl.description}</p>
                  )}
                </div>
              </button>
            ))}
            <button
              onClick={() => setShowTemplatePicker(false)}
              className="w-full py-1 text-center text-xs text-slate-400 hover:text-slate-600"
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

  // ── Carpeta seleccionada ──────────────────────────────────────────────────

  const selectedFolder = selectedFolderId ? findFolderById(phases, selectedFolderId) : null;
  const selectedPhase  = selectedFolderId ? findPhaseForFolder(phases, selectedFolderId) : null;

  // ── Layout split-screen ───────────────────────────────────────────────────

  return (
    <div
      className="flex overflow-hidden rounded-xl border border-slate-200"
      style={{ height: 'calc(100vh - 280px)', minHeight: '520px' }}
    >
      {/* ─── PANEL IZQUIERDO: árbol de carpetas ─────────────────────────── */}
      <div className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50/40">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Árbol del expediente
          </span>
        </div>

        {/* Fases y carpetas */}
        <div className="flex-1 overflow-y-auto py-1.5">
          {phases.map((phase) => {
            const cfg   = PHASE_CONFIG[phase.phaseType];
            const stCfg = PHASE_STATUS_CONFIG[phase.status];

            return (
              <div key={phase.id} className="mb-2.5">
                {/* Cabecera de fase */}
                <div className={cn(
                  'mx-1.5 mb-1 flex items-center justify-between rounded-lg border px-2 py-1.5',
                  cfg.bg, cfg.border,
                )}>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <PhaseStatusIcon status={phase.status} />
                    <span className={cn('truncate text-[11px] font-semibold', cfg.color)}>
                      {phase.name}
                    </span>
                    <span className={cn('shrink-0 text-[10px]', stCfg.color)}>
                      · {stCfg.label}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {phase.status !== 'COMPLETE' && phase.status !== 'LOCKED' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAddRootFolder(phase.id)}
                          title="Nueva carpeta raíz"
                          className="rounded p-0.5 text-slate-500 hover:bg-white/70 hover:text-slate-700"
                        >
                          <FolderPlus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => signOff.mutate(phase.id)}
                          disabled={signOff.isPending}
                          title="Cerrar fase"
                          className={cn('rounded p-0.5 opacity-60 hover:bg-white/70 hover:opacity-100', cfg.color)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    {phase.status === 'COMPLETE' && (
                      <span
                        title={phase.signedOffBy ? `Firmado por ${phase.signedOffBy.name}` : 'Fase completada'}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Carpetas de la fase */}
                {phase.folders.length > 0 ? (
                  <div className="px-1">
                    {phase.folders.map((folder) => (
                      <TreeFolderRow
                        key={folder.id}
                        folder={folder}
                        depth={0}
                        selectedFolderId={selectedFolderId}
                        onSelect={setSelectedFolderId}
                        onAddChild={handleAddChild}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-1 text-[11px] italic text-slate-400">
                    Sin carpetas — usa <FolderPlus className="inline h-3 w-3" /> para agregar
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── PANEL DERECHO: contenido de la carpeta seleccionada ────────── */}
      <div className="flex min-w-0 flex-1 flex-col bg-white">
        {selectedFolder ? (
          <>
            {/* Cabecera del panel derecho */}
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3">
              <div className="flex min-w-0 items-center gap-2">
                {selectedPhase && (
                  <>
                    <span className={cn(
                      'shrink-0 text-xs font-medium',
                      PHASE_CONFIG[selectedPhase.phaseType].color,
                    )}>
                      {selectedPhase.name}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  </>
                )}
                <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 shrink-0">
                  {selectedFolder.ref}
                </span>
                <span className="truncate text-sm font-semibold text-slate-800">
                  {selectedFolder.name}
                </span>
                {(selectedFolder.papers?.length ?? 0) > 0 && (
                  <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                    {selectedFolder.papers.length}{' '}
                    {selectedFolder.papers.length === 1 ? 'documento' : 'documentos'}
                  </span>
                )}
              </div>

              {/* Botones de acción */}
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onCreatePaper?.(selectedFolder.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                >
                  <FilePlus className="h-3.5 w-3.5" />
                  Papel inteligente
                </button>
                <button
                  type="button"
                  onClick={() => setUploadFolderId(selectedFolder.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Subir archivo
                </button>
              </div>
            </div>

            {/* Descripción de carpeta */}
            {selectedFolder.description && (
              <div className="border-b border-slate-100 bg-amber-50/40 px-5 py-2">
                <p className="text-xs text-slate-500">{selectedFolder.description}</p>
              </div>
            )}

            {/* Tabla de papeles */}
            {(selectedFolder.papers?.length ?? 0) > 0 ? (
              <div className="flex-1 overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="w-9 py-2.5 pl-5 pr-2" />
                      <th className="w-20 px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Ref.
                      </th>
                      <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Documento
                      </th>
                      <th className="w-28 px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Tipo
                      </th>
                      <th className="w-28 px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Estado
                      </th>
                      <th className="w-28 px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Fecha
                      </th>
                      <th className="w-16 py-2.5 pl-2 pr-5" />
                    </tr>
                  </thead>
                  <tbody>
                    {selectedFolder.papers.map((paper) => (
                      <PaperTableRow key={paper.id} paper={paper} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Carpeta vacía */
              <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                  <FileText className="h-7 w-7 text-slate-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-600">Carpeta vacía</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Agrega papeles de trabajo o sube archivos de evidencia
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onCreatePaper?.(selectedFolder.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    <FilePlus className="h-3.5 w-3.5" /> Papel inteligente
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadFolderId(selectedFolder.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Upload className="h-3.5 w-3.5" /> Subir archivo
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Ninguna carpeta seleccionada */
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
              <FolderOpen className="h-8 w-8 text-blue-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-600">Selecciona una carpeta</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Haz clic en cualquier carpeta del árbol para ver su contenido
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {folderModal && (
        <FolderModal
          title={folderModal.mode === 'create' ? 'Nueva carpeta' : 'Renombrar carpeta'}
          initialRef={folderModal.folder?.ref}
          initialName={folderModal.folder?.name}
          onSave={handleFolderModalSave}
          onClose={() => setFolderModal(null)}
        />
      )}
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
