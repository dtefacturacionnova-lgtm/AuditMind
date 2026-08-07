'use client';

import { useRef, useState } from 'react';
import {
  Plus, Trash2, X, FileText, Loader2, Paperclip, CheckCircle2, XCircle,
} from 'lucide-react';
import { useAttachToDocumentEvidence, useRemoveDocumentEvidenceAttachment } from '@/hooks/useWorkingPaperGraph';
import type { EvidenceAttachment } from './DocumentEvidencePanel';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeclaracionRow {
  id:                  string;
  nombre:              string;
  cargo:               string;
  dui:                 string;
  notas:               string;
  confirmaIndependencia: 'SI' | 'NO' | '';
  attachments:         EvidenceAttachment[];
}

interface Props {
  paperId:  string;
  rows:     DeclaracionRow[];
  onChange: (rows: DeclaracionRow[]) => void;
  readOnly?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newRow(): DeclaracionRow {
  return {
    id:                   `decl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    nombre:               '',
    cargo:                '',
    dui:                  '',
    notas:                '',
    confirmaIndependencia: '',
    attachments:          [],
  };
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ─── Single row ───────────────────────────────────────────────────────────────

interface RowProps {
  row:      DeclaracionRow;
  index:    number;
  paperId:  string;
  readOnly: boolean;
  onUpdate: (patch: Partial<DeclaracionRow>) => void;
  onDelete: () => void;
}

function DeclaracionRowItem({ row, index, paperId, readOnly, onUpdate, onDelete }: RowProps) {
  const fileRef  = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing,  setRemoving]  = useState<string | null>(null);

  const attachMutation = useAttachToDocumentEvidence();
  const removeMutation = useRemoveDocumentEvidenceAttachment();

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const att = await attachMutation.mutateAsync({ paperId, rowId: row.id, file });
      onUpdate({ attachments: [...(row.attachments ?? []), att] });
    } catch (e) {
      alert('Error al subir archivo: ' + (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(attachmentId: string) {
    setRemoving(attachmentId);
    try {
      await removeMutation.mutateAsync({ paperId, rowId: row.id, attachmentId });
      onUpdate({ attachments: (row.attachments ?? []).filter(a => a.id !== attachmentId) });
    } catch (e) {
      alert('Error al quitar archivo: ' + (e as Error).message);
    } finally {
      setRemoving(null);
    }
  }

  const cellCls = 'px-3 py-2.5 align-top';
  const inputCls =
    'w-full text-xs text-gray-800 bg-transparent border-b border-transparent ' +
    'hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5 ' +
    'placeholder:text-gray-300 transition-colors disabled:cursor-default';

  return (
    <tr className="group border-b border-gray-50 last:border-0 hover:bg-blue-50/20 transition-colors">
      {/* # */}
      <td className="px-3 py-2.5 w-7 align-middle">
        <span className="text-[11px] text-gray-400 font-mono tabular-nums">{index + 1}</span>
      </td>

      {/* Nombre completo */}
      <td className={`${cellCls} min-w-[140px]`}>
        <input
          type="text"
          value={row.nombre}
          onChange={e => onUpdate({ nombre: e.target.value })}
          disabled={readOnly}
          placeholder="Juan Pérez García"
          className={inputCls}
        />
      </td>

      {/* Cargo */}
      <td className={`${cellCls} min-w-[120px]`}>
        <input
          type="text"
          value={row.cargo}
          onChange={e => onUpdate({ cargo: e.target.value })}
          disabled={readOnly}
          placeholder="Auditor Senior"
          className={inputCls}
        />
      </td>

      {/* DUI / NIT / Pasaporte */}
      <td className={`${cellCls} w-32`}>
        <input
          type="text"
          value={row.dui}
          onChange={e => onUpdate({ dui: e.target.value })}
          disabled={readOnly}
          placeholder="01234567-8"
          className={inputCls}
        />
      </td>

      {/* Confirma independencia */}
      <td className={`${cellCls} w-28`}>
        {readOnly ? (
          row.confirmaIndependencia === 'SI' ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Sí
            </span>
          ) : row.confirmaIndependencia === 'NO' ? (
            <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
              <XCircle className="w-3.5 h-3.5" /> No
            </span>
          ) : (
            <span className="text-xs text-gray-400 italic">—</span>
          )
        ) : (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onUpdate({ confirmaIndependencia: 'SI' })}
              className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                row.confirmaIndependencia === 'SI'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'text-gray-500 border-gray-200 hover:border-emerald-300 hover:text-emerald-700'
              }`}
            >
              Sí
            </button>
            <button
              type="button"
              onClick={() => onUpdate({ confirmaIndependencia: 'NO' })}
              className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                row.confirmaIndependencia === 'NO'
                  ? 'bg-red-500 text-white border-red-500'
                  : 'text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-600'
              }`}
            >
              No
            </button>
          </div>
        )}
      </td>

      {/* Notas */}
      <td className={`${cellCls} min-w-[140px]`}>
        <textarea
          value={row.notas}
          onChange={e => onUpdate({ notas: e.target.value })}
          disabled={readOnly}
          rows={2}
          placeholder="Observaciones o situaciones declaradas…"
          className={`${inputCls} resize-none`}
        />
      </td>

      {/* Archivo adjunto */}
      <td className={`${cellCls} w-44`}>
        <div className="flex flex-col gap-1">
          {(row.attachments ?? []).map(att => (
            <div
              key={att.id}
              className="flex items-center gap-1.5 px-1.5 py-1 bg-white border border-gray-100
                rounded shadow-sm group/chip hover:border-gray-200"
            >
              <FileText className="w-3 h-3 shrink-0 text-red-500" />
              <a
                href={att.url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-600 hover:underline truncate max-w-[80px]"
                title={att.filename}
              >
                {att.filename}
              </a>
              <span className="text-[10px] text-gray-400 ml-auto shrink-0 tabular-nums">
                {fmtSize(att.size)}
              </span>
              {!readOnly && (
                removing === att.id ? (
                  <Loader2 className="w-3 h-3 text-gray-400 animate-spin ml-0.5 shrink-0" />
                ) : (
                  <button
                    onClick={() => handleRemove(att.id)}
                    className="opacity-0 group-hover/chip:opacity-100 text-gray-300
                      hover:text-red-500 transition-all ml-0.5 shrink-0"
                    title="Quitar archivo"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )
              )}
            </div>
          ))}

          {!readOnly && (
            <>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept="application/pdf,image/*,.docx,.doc"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-blue-600
                  transition-colors disabled:opacity-40 mt-0.5"
              >
                {uploading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Paperclip className="w-3 h-3" />
                )}
                <span>{uploading ? 'Subiendo…' : 'Adjuntar'}</span>
              </button>
            </>
          )}
        </div>
      </td>

      {/* Eliminar */}
      {!readOnly && (
        <td className="px-2 py-2.5 w-7 align-middle">
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
            title="Eliminar fila"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export function DeclaracionesIndependenciaPanel({ paperId, rows, onChange, readOnly = false }: Props) {
  function addRow() {
    onChange([...rows, newRow()]);
  }

  function updateRow(id: string, patch: Partial<DeclaracionRow>) {
    onChange(rows.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  function deleteRow(id: string) {
    onChange(rows.filter(r => r.id !== id));
  }

  const confirmed = rows.filter(r => r.confirmaIndependencia === 'SI').length;

  return (
    <div className="mt-1">
      {rows.length === 0 ? (
        /* Empty state */
        <div className="py-8 text-center border border-dashed border-gray-200 rounded-xl">
          <p className="text-xs text-gray-400 mb-3">
            Sin declaraciones registradas. Agregue una fila por cada miembro del equipo de auditoría.
          </p>
          {!readOnly && (
            <button
              onClick={addRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100
                text-blue-700 text-xs font-medium rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar declarante
            </button>
          )}
        </div>
      ) : (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          {/* Summary strip */}
          {rows.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-100">
              <span className="text-[11px] text-gray-500">
                {rows.length} {rows.length === 1 ? 'declarante' : 'declarantes'}
              </span>
              {confirmed > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-700">
                  <CheckCircle2 className="w-3 h-3" />
                  {confirmed} confirma{confirmed === 1 ? '' : 'n'} independencia
                </span>
              )}
              {rows.some(r => r.confirmaIndependencia === 'NO') && (
                <span className="flex items-center gap-1 text-[11px] text-red-600">
                  <XCircle className="w-3 h-3" />
                  {rows.filter(r => r.confirmaIndependencia === 'NO').length} no confirma
                </span>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white border-b border-gray-100">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-7">#</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide min-w-[140px]">Nombre completo</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide min-w-[120px]">Cargo / Rol</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-32">DUI / NIT</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-28">Independencia</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide min-w-[140px]">Notas</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-44">Declaración adjunta</th>
                  {!readOnly && <th className="w-7" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <DeclaracionRowItem
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
            <div className="px-4 py-2.5 border-t border-gray-50 bg-gray-50/40">
              <button
                onClick={addRow}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600
                  transition-colors font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar declarante
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
