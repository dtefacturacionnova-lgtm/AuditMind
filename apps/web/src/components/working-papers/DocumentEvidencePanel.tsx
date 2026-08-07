'use client';

import { useRef, useState } from 'react';
import {
  Paperclip, Plus, Trash2, X, FileText, Image as ImageIcon,
  FileSpreadsheet, File as FileGeneric, Loader2, ChevronDown,
} from 'lucide-react';
import {
  useAttachToDocumentEvidence,
  useRemoveDocumentEvidenceAttachment,
} from '@/hooks/useWorkingPaperGraph';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EvidenceAttachment {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface DocumentEvidenceRow {
  id: string;
  name: string;
  description: string;
  reviewedBy: string;
  attachments: EvidenceAttachment[];
}

interface Props {
  paperId: string;
  rows: DocumentEvidenceRow[];
  onChange: (rows: DocumentEvidenceRow[]) => void;
  readOnly?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newRow(): DocumentEvidenceRow {
  return {
    id: `de_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    description: '',
    reviewedBy: '',
    attachments: [],
  };
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === 'application/pdf')
    return <FileText className="w-3.5 h-3.5 shrink-0 text-red-500" />;
  if (mimeType.startsWith('image/'))
    return <ImageIcon className="w-3.5 h-3.5 shrink-0 text-blue-500" />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv'))
    return <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-emerald-600" />;
  if (mimeType.includes('word') || mimeType.includes('document'))
    return <FileText className="w-3.5 h-3.5 shrink-0 text-blue-700" />;
  return <FileGeneric className="w-3.5 h-3.5 shrink-0 text-gray-400" />;
}

// ─── Row component ─────────────────────────────────────────────────────────────

interface RowProps {
  row: DocumentEvidenceRow;
  index: number;
  paperId: string;
  readOnly: boolean;
  onUpdate: (patch: Partial<DocumentEvidenceRow>) => void;
  onDelete: () => void;
}

function EvidenceRow({ row, index, paperId, readOnly, onUpdate, onDelete }: RowProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading]   = useState(false);
  const [removing, setRemoving]     = useState<string | null>(null);

  const attachMutation = useAttachToDocumentEvidence();
  const removeMutation = useRemoveDocumentEvidenceAttachment();

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const att = await attachMutation.mutateAsync({ paperId, rowId: row.id, file });
      onUpdate({ attachments: [...row.attachments, att] });
    } catch (e) {
      alert('Error al subir el archivo: ' + (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(attachmentId: string) {
    setRemoving(attachmentId);
    try {
      await removeMutation.mutateAsync({ paperId, rowId: row.id, attachmentId });
      onUpdate({ attachments: row.attachments.filter(a => a.id !== attachmentId) });
    } catch (e) {
      alert('Error al quitar el archivo: ' + (e as Error).message);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <tr className="group border-b border-gray-50 last:border-0 align-top hover:bg-blue-50/20 transition-colors">
      {/* # */}
      <td className="px-4 py-3 w-8">
        <span className="text-xs text-gray-400 font-mono tabular-nums">{index + 1}</span>
      </td>

      {/* Nombre del documento */}
      <td className="px-3 py-3 w-52">
        <input
          type="text"
          value={row.name}
          onChange={e => onUpdate({ name: e.target.value })}
          disabled={readOnly}
          placeholder="Nombre del documento…"
          className="w-full text-xs text-gray-800 bg-transparent border-b border-transparent
            hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5
            placeholder:text-gray-300 transition-colors disabled:cursor-default"
        />
      </td>

      {/* Contenido / Descripción */}
      <td className="px-3 py-3 min-w-[180px]">
        <textarea
          value={row.description}
          onChange={e => onUpdate({ description: e.target.value })}
          disabled={readOnly}
          rows={2}
          placeholder="Descripción del contenido o propósito del documento…"
          className="w-full text-xs text-gray-800 bg-transparent border-b border-transparent
            hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5
            placeholder:text-gray-300 resize-none transition-colors disabled:cursor-default"
        />
      </td>

      {/* Revisado por */}
      <td className="px-3 py-3 w-36">
        <input
          type="text"
          value={row.reviewedBy}
          onChange={e => onUpdate({ reviewedBy: e.target.value })}
          disabled={readOnly}
          placeholder="Revisor…"
          className="w-full text-xs text-gray-800 bg-transparent border-b border-transparent
            hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5
            placeholder:text-gray-300 transition-colors disabled:cursor-default"
        />
      </td>

      {/* Evidencias adjuntas */}
      <td className="px-3 py-3 w-60">
        <div className="flex flex-col gap-1">
          {row.attachments.map(att => (
            <div
              key={att.id}
              className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-100
                rounded-md shadow-sm group/chip hover:border-gray-200 transition-colors"
            >
              <FileIcon mimeType={att.mimeType} />
              <a
                href={att.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:underline truncate max-w-[110px]"
                title={att.filename}
              >
                {att.filename}
              </a>
              <span className="text-[10px] text-gray-400 ml-auto shrink-0 tabular-nums">
                {fmtSize(att.size)}
              </span>
              {!readOnly && (
                removing === att.id ? (
                  <Loader2 className="w-3 h-3 text-gray-400 animate-spin ml-1 shrink-0" />
                ) : (
                  <button
                    onClick={() => handleRemove(att.id)}
                    className="opacity-0 group-hover/chip:opacity-100 text-gray-300
                      hover:text-red-500 transition-all ml-1 shrink-0"
                    title="Quitar evidencia"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )
              )}
            </div>
          ))}

          {!readOnly && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="application/pdf,image/*,.xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt,.txt,.zip"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600
                  transition-colors disabled:opacity-40 mt-0.5"
              >
                {uploading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Paperclip className="w-3 h-3" />
                )}
                <span>{uploading ? 'Subiendo…' : 'Adjuntar archivo'}</span>
              </button>
            </>
          )}
        </div>
      </td>

      {/* Eliminar fila */}
      {!readOnly && (
        <td className="px-2 py-3 w-8">
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500
              transition-all"
            title="Eliminar fila"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function DocumentEvidencePanel({ paperId, rows, onChange, readOnly = false }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  function addRow() {
    onChange([...rows, newRow()]);
  }

  function updateRow(id: string, patch: Partial<DocumentEvidenceRow>) {
    onChange(rows.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  function deleteRow(id: string) {
    onChange(rows.filter(r => r.id !== id));
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b border-gray-100 cursor-pointer select-none"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-sm font-semibold text-gray-700">
            Documentos y Evidencias Recibidos
          </span>
          {rows.length > 0 && (
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full tabular-nums">
              {rows.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button
              onClick={e => { e.stopPropagation(); addRow(); setCollapsed(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700
                text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          />
        </div>
      </div>

      {!collapsed && (
        <>
          {rows.length === 0 ? (
            /* Empty state */
            <div className="py-12 text-center px-6">
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <Paperclip className="w-5 h-5 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-500 mb-1">
                Sin documentos registrados
              </p>
              <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
                Registre aquí los documentos proporcionados por el cliente y los generados
                por la firma: escrituras, contratos, políticas, informes previos, etc.
              </p>
              {!readOnly && (
                <button
                  onClick={addRow}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-50
                    hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar primer documento
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100">
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-8">
                        #
                      </th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-52">
                        Nombre del Documento
                      </th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                        Contenido / Descripción
                      </th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-36">
                        Revisado por
                      </th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-60">
                        Evidencias adjuntas
                      </th>
                      {!readOnly && <th className="w-8" />}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <EvidenceRow
                        key={row.id}
                        row={row}
                        index={idx}
                        paperId={paperId}
                        readOnly={readOnly}
                        onUpdate={patch => updateRow(row.id, patch)}
                        onDelete={() => deleteRow(row.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {!readOnly && (
                <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/40">
                  <button
                    onClick={addRow}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600
                      transition-colors font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Agregar otro documento
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
