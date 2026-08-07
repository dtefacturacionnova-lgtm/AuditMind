'use client';

import { useRef, useState } from 'react';
import {
  Plus, Trash2, X, FileText, Loader2, Paperclip, MessageSquare,
} from 'lucide-react';
import { useAttachToDocumentEvidence, useRemoveDocumentEvidenceAttachment } from '@/hooks/useWorkingPaperGraph';
import type { EvidenceAttachment } from './DocumentEvidencePanel';

// ─── Types ────────────────────────────────────────────────────────────────────

const ASUNTOS_OPTIONS = [
  'Plan de auditoría',
  'Riesgos identificados',
  'Fraude',
  'Deficiencias de control',
  'Incumplimientos',
  'Hallazgos relevantes',
  'Litigios',
  'Cambios en procesos',
  'Sistemas de información',
  'Otros',
] as const;

export interface ComunicacionRow {
  id:               string;
  fecha:            string;
  participantes:    string;
  tema:             string;
  asuntos:          string[];
  resultado:        string;
  referencia:       string;
  attachments:      EvidenceAttachment[];
}

interface Props {
  paperId:  string;
  rows:     ComunicacionRow[];
  onChange: (rows: ComunicacionRow[]) => void;
  readOnly?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newRow(): ComunicacionRow {
  return {
    id:            `com_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    fecha:         '',
    participantes: '',
    tema:          '',
    asuntos:       [],
    resultado:     '',
    referencia:    '',
    attachments:   [],
  };
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ─── Single row ───────────────────────────────────────────────────────────────

interface RowProps {
  row:      ComunicacionRow;
  index:    number;
  paperId:  string;
  readOnly: boolean;
  onUpdate: (patch: Partial<ComunicacionRow>) => void;
  onDelete: () => void;
}

function ComunicacionRowItem({ row, index, paperId, readOnly, onUpdate, onDelete }: RowProps) {
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

  function toggleAsunto(asunto: string) {
    const current = row.asuntos ?? [];
    const next = current.includes(asunto)
      ? current.filter(a => a !== asunto)
      : [...current, asunto];
    onUpdate({ asuntos: next });
  }

  const cellCls = 'px-3 py-2.5 align-top';
  const inputCls =
    'w-full text-xs text-gray-800 bg-transparent border-b border-transparent ' +
    'hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5 ' +
    'placeholder:text-gray-300 transition-colors disabled:cursor-default';

  return (
    <tr className="group border-b border-gray-50 last:border-0 hover:bg-blue-50/10 transition-colors">
      {/* # */}
      <td className="px-3 py-2.5 w-7 align-top pt-3">
        <span className="text-[11px] text-gray-400 font-mono tabular-nums">{index + 1}</span>
      </td>

      {/* Fecha */}
      <td className={`${cellCls} w-32`}>
        <input
          type="date"
          value={row.fecha}
          onChange={e => onUpdate({ fecha: e.target.value })}
          disabled={readOnly}
          className={`${inputCls} text-[11px]`}
        />
      </td>

      {/* Participantes */}
      <td className={`${cellCls} min-w-[130px]`}>
        <textarea
          value={row.participantes}
          onChange={e => onUpdate({ participantes: e.target.value })}
          disabled={readOnly}
          rows={2}
          placeholder="Auditor externo, Jefe AI…"
          className={`${inputCls} resize-none`}
        />
      </td>

      {/* Tema */}
      <td className={`${cellCls} min-w-[130px]`}>
        <input
          type="text"
          value={row.tema}
          onChange={e => onUpdate({ tema: e.target.value })}
          disabled={readOnly}
          placeholder="Reunión de coordinación…"
          className={inputCls}
        />
      </td>

      {/* Asuntos discutidos */}
      <td className={`${cellCls} min-w-[180px]`}>
        {readOnly ? (
          <div className="flex flex-wrap gap-1">
            {(row.asuntos ?? []).length > 0
              ? (row.asuntos ?? []).map(a => (
                  <span key={a} className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 border border-blue-100">
                    {a}
                  </span>
                ))
              : <span className="text-xs text-gray-300 italic">—</span>
            }
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {ASUNTOS_OPTIONS.map(asunto => {
              const selected = (row.asuntos ?? []).includes(asunto);
              return (
                <button
                  key={asunto}
                  type="button"
                  onClick={() => toggleAsunto(asunto)}
                  className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                    selected
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-700'
                  }`}
                >
                  {asunto}
                </button>
              );
            })}
          </div>
        )}
      </td>

      {/* Resultado */}
      <td className={`${cellCls} min-w-[110px]`}>
        <textarea
          value={row.resultado}
          onChange={e => onUpdate({ resultado: e.target.value })}
          disabled={readOnly}
          rows={2}
          placeholder="Acuerdos o compromisos…"
          className={`${inputCls} resize-none`}
        />
      </td>

      {/* Referencia */}
      <td className={`${cellCls} w-24`}>
        <input
          type="text"
          value={row.referencia}
          onChange={e => onUpdate({ referencia: e.target.value })}
          disabled={readOnly}
          placeholder="PT-610-001"
          className={inputCls}
        />
      </td>

      {/* Adjunto */}
      <td className={`${cellCls} w-40`}>
        <div className="flex flex-col gap-1">
          {(row.attachments ?? []).map(att => (
            <div
              key={att.id}
              className="flex items-center gap-1.5 px-1.5 py-1 bg-white border border-gray-100
                rounded shadow-sm group/chip hover:border-gray-200"
            >
              <FileText className="w-3 h-3 shrink-0 text-blue-500" />
              <a
                href={att.url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-600 hover:underline truncate max-w-[70px]"
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
                {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                <span>{uploading ? 'Subiendo…' : 'Adjuntar'}</span>
              </button>
            </>
          )}
        </div>
      </td>

      {/* Eliminar */}
      {!readOnly && (
        <td className="px-2 py-2.5 w-7 align-top pt-3">
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export function ComunicacionAIPanel({ paperId, rows, onChange, readOnly = false }: Props) {
  function addRow() { onChange([...rows, newRow()]); }
  function updateRow(id: string, patch: Partial<ComunicacionRow>) {
    onChange(rows.map(r => r.id === id ? { ...r, ...patch } : r));
  }
  function deleteRow(id: string) { onChange(rows.filter(r => r.id !== id)); }

  return (
    <div className="mt-1">
      {rows.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-gray-200 rounded-xl">
          <MessageSquare className="w-6 h-6 text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-400 mb-3">
            Sin comunicaciones registradas. Documente las reuniones y comunicaciones con el equipo de Auditoría Interna.
          </p>
          {!readOnly && (
            <button
              onClick={addRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100
                text-blue-700 text-xs font-medium rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar comunicación
            </button>
          )}
        </div>
      ) : (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-100">
            <span className="text-[11px] text-gray-500">
              {rows.length} {rows.length === 1 ? 'comunicación' : 'comunicaciones'}
            </span>
          </div>

          <div className="overflow-x-auto" style={{ minWidth: 0 }}>
            <table className="w-full text-sm" style={{ minWidth: '1000px' }}>
              <thead>
                <tr className="bg-white border-b border-gray-100">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-7">#</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-32">Fecha</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide min-w-[130px]">Participantes</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide min-w-[130px]">Tema</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide min-w-[180px]">Asuntos discutidos</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide min-w-[110px]">Resultado</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-24">Ref.</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-40">Evidencia adjunta</th>
                  {!readOnly && <th className="w-7" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <ComunicacionRowItem
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
                Agregar comunicación
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
