'use client';

import { useRef, useState } from 'react';
import {
  Plus, Trash2, X, FileText, Loader2, Paperclip,
  Building2, Globe, Landmark,
} from 'lucide-react';
import { useAttachToDocumentEvidence, useRemoveDocumentEvidenceAttachment } from '@/hooks/useWorkingPaperGraph';
import type { EvidenceAttachment } from './DocumentEvidencePanel';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NormativaTipo = 'INTERNA' | 'EXTERNA' | 'GOBIERNO' | '';

export interface NormativaRow {
  id:                   string;
  area:                 string;
  nombre:               string;
  version:              string;
  descripcion:          string;
  resumenAplicabilidad: string;
  fechaInicioVigencia:  string;
  fechaFinVigencia:     string;
  fuente:               string;
  tipo:                 NormativaTipo;
  notas:                string;
  revisadaPor:          string;
  referencia:           string;
  attachments:          EvidenceAttachment[];
}

interface Props {
  paperId:  string;
  rows:     NormativaRow[];
  onChange: (rows: NormativaRow[]) => void;
  readOnly?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newRow(): NormativaRow {
  return {
    id:                   `norm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    area:                 '',
    nombre:               '',
    version:              '',
    descripcion:          '',
    resumenAplicabilidad: '',
    fechaInicioVigencia:  '',
    fechaFinVigencia:     '',
    fuente:               '',
    tipo:                 '',
    notas:                '',
    revisadaPor:          '',
    referencia:           '',
    attachments:          [],
  };
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const TIPO_CONFIG: Record<Exclude<NormativaTipo, ''>, { label: string; icon: React.ReactNode; active: string; hover: string }> = {
  INTERNA: {
    label:  'Interna',
    icon:   <Building2 className="w-3 h-3" />,
    active: 'bg-blue-600 text-white border-blue-600',
    hover:  'hover:border-blue-300 hover:text-blue-700',
  },
  EXTERNA: {
    label:  'Externa',
    icon:   <Globe className="w-3 h-3" />,
    active: 'bg-violet-600 text-white border-violet-600',
    hover:  'hover:border-violet-300 hover:text-violet-700',
  },
  GOBIERNO: {
    label:  'Gobierno',
    icon:   <Landmark className="w-3 h-3" />,
    active: 'bg-amber-600 text-white border-amber-600',
    hover:  'hover:border-amber-300 hover:text-amber-700',
  },
};

// ─── Single row ───────────────────────────────────────────────────────────────

interface RowProps {
  row:      NormativaRow;
  index:    number;
  paperId:  string;
  readOnly: boolean;
  onUpdate: (patch: Partial<NormativaRow>) => void;
  onDelete: () => void;
}

function NormativaRowItem({ row, index, paperId, readOnly, onUpdate, onDelete }: RowProps) {
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

  const tdBase = 'px-2 py-2 align-top border-r border-gray-50 last:border-0';
  const inputCls =
    'w-full text-xs text-gray-800 bg-transparent border-b border-transparent ' +
    'hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5 ' +
    'placeholder:text-gray-300 transition-colors disabled:cursor-default';
  const textareaCls = `${inputCls} resize-none`;
  const dateCls =
    'w-full text-[11px] text-gray-700 bg-white border border-gray-200 rounded px-1.5 py-0.5 ' +
    'focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:cursor-default';

  return (
    <tr className="group border-b border-gray-100 last:border-0 hover:bg-blue-50/20 transition-colors">
      {/* # */}
      <td className={`${tdBase} w-6 text-center`}>
        <span className="text-[10px] text-gray-400 font-mono">{index + 1}</span>
      </td>

      {/* Área */}
      <td className={`${tdBase} min-w-[90px]`}>
        <input type="text" value={row.area} onChange={e => onUpdate({ area: e.target.value })}
          disabled={readOnly} placeholder="Tributaria…" className={inputCls} />
      </td>

      {/* Nombre de la normativa */}
      <td className={`${tdBase} min-w-[150px]`}>
        <textarea value={row.nombre} onChange={e => onUpdate({ nombre: e.target.value })}
          disabled={readOnly} rows={2} placeholder="Código Tributario SV…" className={textareaCls} />
      </td>

      {/* Versión */}
      <td className={`${tdBase} w-20`}>
        <input type="text" value={row.version} onChange={e => onUpdate({ version: e.target.value })}
          disabled={readOnly} placeholder="2023" className={inputCls} />
      </td>

      {/* Descripción */}
      <td className={`${tdBase} min-w-[140px]`}>
        <textarea value={row.descripcion} onChange={e => onUpdate({ descripcion: e.target.value })}
          disabled={readOnly} rows={2} placeholder="Objeto y alcance…" className={textareaCls} />
      </td>

      {/* Resumen de aplicabilidad */}
      <td className={`${tdBase} min-w-[140px]`}>
        <textarea value={row.resumenAplicabilidad} onChange={e => onUpdate({ resumenAplicabilidad: e.target.value })}
          disabled={readOnly} rows={2} placeholder="Aplica por ser contribuyente del ISR…" className={textareaCls} />
      </td>

      {/* Fecha inicio */}
      <td className={`${tdBase} w-28`}>
        <input type="date" value={row.fechaInicioVigencia} onChange={e => onUpdate({ fechaInicioVigencia: e.target.value })}
          disabled={readOnly} className={dateCls} title="Fecha inicio de vigencia" />
      </td>

      {/* Fecha fin */}
      <td className={`${tdBase} w-28`}>
        <input type="date" value={row.fechaFinVigencia} onChange={e => onUpdate({ fechaFinVigencia: e.target.value })}
          disabled={readOnly} className={dateCls} title="Fecha fin de vigencia (vacío = vigente)" />
      </td>

      {/* Fuente */}
      <td className={`${tdBase} min-w-[100px]`}>
        <input type="text" value={row.fuente} onChange={e => onUpdate({ fuente: e.target.value })}
          disabled={readOnly} placeholder="D.O. / Web DGII…" className={inputCls} />
      </td>

      {/* Tipo: Interna / Externa / Gobierno */}
      <td className={`${tdBase} w-28`}>
        {readOnly ? (
          row.tipo ? (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
              row.tipo === 'INTERNA'  ? 'bg-blue-50 text-blue-700 border-blue-200' :
              row.tipo === 'EXTERNA'  ? 'bg-violet-50 text-violet-700 border-violet-200' :
              'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {TIPO_CONFIG[row.tipo].icon}
              {TIPO_CONFIG[row.tipo].label}
            </span>
          ) : <span className="text-[10px] text-gray-400 italic">—</span>
        ) : (
          <div className="flex flex-col gap-1">
            {(Object.entries(TIPO_CONFIG) as [Exclude<NormativaTipo,''>, typeof TIPO_CONFIG[keyof typeof TIPO_CONFIG]][]).map(([key, cfg]) => (
              <button key={key} type="button"
                onClick={() => onUpdate({ tipo: row.tipo === key ? '' : key })}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                  row.tipo === key ? cfg.active : `text-gray-500 border-gray-200 ${cfg.hover}`
                }`}
              >
                {cfg.icon}{cfg.label}
              </button>
            ))}
          </div>
        )}
      </td>

      {/* Notas */}
      <td className={`${tdBase} min-w-[110px]`}>
        <textarea value={row.notas} onChange={e => onUpdate({ notas: e.target.value })}
          disabled={readOnly} rows={2} placeholder="Observaciones…" className={textareaCls} />
      </td>

      {/* Revisada por */}
      <td className={`${tdBase} w-24`}>
        <input type="text" value={row.revisadaPor} onChange={e => onUpdate({ revisadaPor: e.target.value })}
          disabled={readOnly} placeholder="Auditor…" className={inputCls} />
      </td>

      {/* Referencia */}
      <td className={`${tdBase} w-24`}>
        <input type="text" value={row.referencia} onChange={e => onUpdate({ referencia: e.target.value })}
          disabled={readOnly} placeholder="A-09/S2" className={inputCls} />
      </td>

      {/* Evidencia adjunta */}
      <td className={`${tdBase} w-36`}>
        <div className="flex flex-col gap-1">
          {(row.attachments ?? []).map(att => (
            <div key={att.id}
              className="flex items-center gap-1 px-1.5 py-0.5 bg-white border border-gray-100 rounded shadow-sm group/chip hover:border-gray-200"
            >
              <FileText className="w-3 h-3 shrink-0 text-red-500" />
              <a href={att.url} target="_blank" rel="noreferrer"
                className="text-[10px] text-blue-600 hover:underline truncate max-w-[60px]" title={att.filename}>
                {att.filename}
              </a>
              <span className="text-[9px] text-gray-400 ml-auto shrink-0">{fmtSize(att.size)}</span>
              {!readOnly && (
                removing === att.id
                  ? <Loader2 className="w-2.5 h-2.5 text-gray-400 animate-spin ml-0.5 shrink-0" />
                  : <button onClick={() => handleRemove(att.id)}
                      className="opacity-0 group-hover/chip:opacity-100 text-gray-300 hover:text-red-500 transition-all ml-0.5 shrink-0">
                      <X className="w-2.5 h-2.5" />
                    </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <>
              <input ref={fileRef} type="file" className="hidden"
                accept="application/pdf,image/*,.xlsx,.xls,.csv,.docx,.doc,.txt"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-40 mt-0.5">
                {uploading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Paperclip className="w-2.5 h-2.5" />}
                <span>{uploading ? 'Subiendo…' : 'Adjuntar'}</span>
              </button>
            </>
          )}
        </div>
      </td>

      {/* Eliminar */}
      {!readOnly && (
        <td className="px-2 py-2 w-6 align-middle">
          <button onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
            title="Eliminar fila">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export function MarcoLegalNormativaPanel({ paperId, rows, onChange, readOnly = false }: Props) {
  function addRow() { onChange([...rows, newRow()]); }
  function updateRow(id: string, patch: Partial<NormativaRow>) {
    onChange(rows.map(r => r.id === id ? { ...r, ...patch } : r));
  }
  function deleteRow(id: string) { onChange(rows.filter(r => r.id !== id)); }

  const byTipo = {
    INTERNA:  rows.filter(r => r.tipo === 'INTERNA').length,
    EXTERNA:  rows.filter(r => r.tipo === 'EXTERNA').length,
    GOBIERNO: rows.filter(r => r.tipo === 'GOBIERNO').length,
  };

  const headers = [
    { label: '#',           cls: 'w-6 text-center' },
    { label: 'Área',        cls: 'min-w-[90px]' },
    { label: 'Normativa',   cls: 'min-w-[150px]' },
    { label: 'Versión',     cls: 'w-20' },
    { label: 'Descripción', cls: 'min-w-[140px]' },
    { label: 'Aplicabilidad', cls: 'min-w-[140px]' },
    { label: 'Inicio vigencia', cls: 'w-28' },
    { label: 'Fin vigencia',    cls: 'w-28' },
    { label: 'Fuente',      cls: 'min-w-[100px]' },
    { label: 'Tipo',        cls: 'w-28' },
    { label: 'Notas',       cls: 'min-w-[110px]' },
    { label: 'Revisada por', cls: 'w-24' },
    { label: 'Referencia',  cls: 'w-24' },
    { label: 'Evidencia',   cls: 'w-36' },
  ];

  return (
    <div className="mt-1">
      {rows.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-gray-200 rounded-xl">
          <p className="text-xs text-gray-400 mb-3">
            Sin normativas registradas. Agregue una fila por cada ley o regulación aplicable.
          </p>
          {!readOnly && (
            <button onClick={addRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" /> Agregar normativa
            </button>
          )}
        </div>
      ) : (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          {/* Summary strip */}
          <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-b border-gray-100 flex-wrap">
            <span className="text-[11px] text-gray-500">
              {rows.length} {rows.length === 1 ? 'normativa' : 'normativas'}
            </span>
            {byTipo.INTERNA > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-blue-700">
                <Building2 className="w-3 h-3" /> {byTipo.INTERNA} Interna{byTipo.INTERNA > 1 ? 's' : ''}
              </span>
            )}
            {byTipo.EXTERNA > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-violet-700">
                <Globe className="w-3 h-3" /> {byTipo.EXTERNA} Externa{byTipo.EXTERNA > 1 ? 's' : ''}
              </span>
            )}
            {byTipo.GOBIERNO > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-amber-700">
                <Landmark className="w-3 h-3" /> {byTipo.GOBIERNO} Gobierno
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: '1400px' }}>
              <thead>
                <tr className="bg-white border-b border-gray-100">
                  {headers.map(h => (
                    <th key={h.label}
                      className={`px-2 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-r border-gray-50 last:border-0 ${h.cls}`}>
                      {h.label}
                    </th>
                  ))}
                  {!readOnly && <th className="w-6" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <NormativaRowItem
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
              <button onClick={addRow}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors font-medium">
                <Plus className="w-3.5 h-3.5" /> Agregar normativa
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
