'use client';

import { useRef, useState } from 'react';
import {
  Plus, Trash2, X, FileText, Loader2, Paperclip, HelpCircle,
} from 'lucide-react';
import { useAttachToDocumentEvidence, useRemoveDocumentEvidenceAttachment } from '@/hooks/useWorkingPaperGraph';
import type { EvidenceAttachment } from './DocumentEvidencePanel';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SampleItemRow {
  id:           string;
  area:         string;
  itemRef:      string;
  descripcion:  string;
  bookValue:    number | null;   // Valor en libros ($)
  auditedValue: number | null;   // Valor auditado ($) — null = aún no examinado
  fecha:        string;
  execRef:      string;          // Ref. papel de ejecución (C-xx)
  attachments:  EvidenceAttachment[];
}

interface Props {
  paperId:  string;
  rows:     SampleItemRow[];
  onChange: (rows: SampleItemRow[]) => void;
  readOnly?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newRow(): SampleItemRow {
  return {
    id:           `smpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    area:         '',
    itemRef:      '',
    descripcion:  '',
    bookValue:    null,
    auditedValue: null,
    fecha:        '',
    execRef:      '',
    attachments:  [],
  };
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function fmtUSD(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Diferencia y tainting % de UN ítem — la misma fórmula que usará S4 para el UEL. */
export function itemDifference(row: SampleItemRow): { diff: number; taintingPct: number | null } {
  const bv = row.bookValue ?? 0;
  const av = row.auditedValue;
  if (av === null || av === undefined) return { diff: 0, taintingPct: null };
  const diff = bv - av;
  const taintingPct = bv !== 0 ? (diff / bv) * 100 : null;
  return { diff, taintingPct };
}

function taintingColor(pct: number): { text: string; bg: string; border: string } {
  const abs = Math.abs(pct);
  if (abs === 0)    return { text: 'text-gray-400',    bg: 'bg-gray-50',    border: 'border-gray-200' };
  if (abs < 5)      return { text: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' };
  if (abs < 25)     return { text: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-200' };
  return              { text: 'text-red-600',      bg: 'bg-red-50',     border: 'border-red-200' };
}

// ─── Modal de metodología ─────────────────────────────────────────────────────

function MethodologyModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-xl w-full max-h-[85vh] overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-700">¿Qué es la diferencia y el "tainting" de un ítem?</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3 text-[12px] text-gray-600 leading-relaxed">
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
            <p className="font-semibold text-violet-700 mb-1">En palabras simples</p>
            <p>
              Por cada ítem que examina, usted compara lo que dicen los libros contables ("valor en libros")
              contra lo que realmente encontró al revisar el soporte ("valor auditado"). Si son iguales, ese
              ítem no tiene error. Si son distintos, la diferencia se expresa como un porcentaje del ítem
              (el "tainting") — eso permite comparar errores de ítems de distinto tamaño en igualdad de
              condiciones, y es lo que la Sección 4 usa para estimar cuánto error podría haber en el resto
              de la población que NO se examinó.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-700 mb-1">Fórmulas</p>
            <div className="bg-gray-50 rounded-lg p-2.5 font-mono text-[11px] text-gray-700 space-y-1">
              <p>Diferencia ($) = Valor en libros − Valor auditado</p>
              <p>Tainting (%) = Diferencia ($) / Valor en libros × 100</p>
            </div>
          </div>

          <div>
            <p className="font-semibold text-gray-700 mb-1">Ejemplo</p>
            <p>
              Un ítem de inventario tiene un valor en libros de <strong>$1,000</strong>. Al inspeccionarlo,
              el auditor determina que su valor real es <strong>$850</strong>. Diferencia = $150.
              Tainting = 150/1,000 = <strong>15%</strong>. Ese 15% es lo que la Sección 4 multiplicará por el
              intervalo de muestreo (S3) para proyectar el error de ese ítem al resto de la población.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-amber-800">
              <strong>Nota:</strong> deje "Valor auditado" en blanco si aún no ha examinado ese ítem — no lo
              ponga igual al valor en libros solo para "completar la fila", porque eso se interpreta como
              "examinado, sin error" y se usa así en el cálculo de la Sección 4.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Single row ───────────────────────────────────────────────────────────────

interface RowProps {
  row:      SampleItemRow;
  index:    number;
  paperId:  string;
  readOnly: boolean;
  onUpdate: (patch: Partial<SampleItemRow>) => void;
  onDelete: () => void;
}

function SampleItemRowItem({ row, index, paperId, readOnly, onUpdate, onDelete }: RowProps) {
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

  const { diff, taintingPct } = itemDifference(row);
  const tCol = taintingPct !== null ? taintingColor(taintingPct) : null;

  const tdBase = 'px-2 py-2 align-top border-r border-gray-50 last:border-0';
  const inputCls =
    'w-full text-xs text-gray-800 bg-transparent border-b border-transparent ' +
    'hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5 ' +
    'placeholder:text-gray-300 transition-colors disabled:cursor-default';
  const numCls = `${inputCls} text-right font-mono`;
  const dateCls =
    'w-full text-[11px] text-gray-700 bg-white border border-gray-200 rounded px-1.5 py-0.5 ' +
    'focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:cursor-default';

  return (
    <tr className="group border-b border-gray-100 last:border-0 hover:bg-blue-50/20 transition-colors">
      <td className={`${tdBase} w-6 text-center`}>
        <span className="text-[10px] text-gray-400 font-mono">{index + 1}</span>
      </td>

      <td className={`${tdBase} min-w-[100px]`}>
        <input type="text" value={row.area} onChange={e => onUpdate({ area: e.target.value })}
          disabled={readOnly} placeholder="Cuentas por Cobrar…" className={inputCls} />
      </td>

      <td className={`${tdBase} w-24`}>
        <input type="text" value={row.itemRef} onChange={e => onUpdate({ itemRef: e.target.value })}
          disabled={readOnly} placeholder="CXC-014" className={inputCls} />
      </td>

      <td className={`${tdBase} min-w-[150px]`}>
        <input type="text" value={row.descripcion} onChange={e => onUpdate({ descripcion: e.target.value })}
          disabled={readOnly} placeholder="Factura N.º 4521…" className={inputCls} />
      </td>

      <td className={`${tdBase} w-28`}>
        <input type="number" step="0.01" value={row.bookValue ?? ''}
          onChange={e => onUpdate({ bookValue: e.target.value === '' ? null : parseFloat(e.target.value) })}
          disabled={readOnly} placeholder="0.00" className={numCls} />
      </td>

      <td className={`${tdBase} w-28`}>
        <input type="number" step="0.01" value={row.auditedValue ?? ''}
          onChange={e => onUpdate({ auditedValue: e.target.value === '' ? null : parseFloat(e.target.value) })}
          disabled={readOnly} placeholder="sin examinar" className={numCls} />
      </td>

      {/* Diferencia — calculada, solo lectura */}
      <td className={`${tdBase} w-24 text-right`}>
        {row.auditedValue !== null ? (
          <span className={`text-xs font-mono ${diff !== 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
            {fmtUSD(diff)}
          </span>
        ) : <span className="text-[10px] text-gray-300">—</span>}
      </td>

      {/* Tainting % — calculado, solo lectura, con color */}
      <td className={`${tdBase} w-20 text-center`}>
        {taintingPct !== null && tCol ? (
          <span className={`inline-block text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded-full border ${tCol.text} ${tCol.bg} ${tCol.border}`}>
            {taintingPct.toFixed(1)}%
          </span>
        ) : <span className="text-[10px] text-gray-300">—</span>}
      </td>

      <td className={`${tdBase} w-28`}>
        <input type="date" value={row.fecha} onChange={e => onUpdate({ fecha: e.target.value })}
          disabled={readOnly} className={dateCls} />
      </td>

      <td className={`${tdBase} w-24`}>
        <input type="text" value={row.execRef} onChange={e => onUpdate({ execRef: e.target.value })}
          disabled={readOnly} placeholder="C-02" className={inputCls} />
      </td>

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

export function SampleItemRegisterPanel({ paperId, rows, onChange, readOnly = false }: Props) {
  const [showHelp, setShowHelp] = useState(false);

  function addRow() { onChange([...rows, newRow()]); }
  function updateRow(id: string, patch: Partial<SampleItemRow>) {
    onChange(rows.map(r => r.id === id ? { ...r, ...patch } : r));
  }
  function deleteRow(id: string) { onChange(rows.filter(r => r.id !== id)); }

  const examinados = rows.filter(r => r.auditedValue !== null).length;
  const conError = rows.filter(r => { const { diff } = itemDifference(r); return r.auditedValue !== null && diff !== 0; }).length;
  const totalDiff = rows.reduce((sum, r) => sum + itemDifference(r).diff, 0);

  const headers = [
    { label: '#',           cls: 'w-6 text-center' },
    { label: 'Área',        cls: 'min-w-[100px]' },
    { label: 'Ítem',        cls: 'w-24' },
    { label: 'Descripción', cls: 'min-w-[150px]' },
    { label: 'Valor en libros', cls: 'w-28 text-right' },
    { label: 'Valor auditado',  cls: 'w-28 text-right' },
    { label: 'Diferencia',  cls: 'w-24 text-right' },
    { label: 'Tainting',    cls: 'w-20 text-center' },
    { label: 'Fecha',       cls: 'w-28' },
    { label: 'Ref. ejecución', cls: 'w-24' },
    { label: 'Evidencia',   cls: 'w-36' },
  ];

  return (
    <div className="mt-1">
      {showHelp && <MethodologyModal onClose={() => setShowHelp(false)} />}

      {rows.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-gray-200 rounded-xl">
          <p className="text-xs text-gray-400 mb-3">
            Sin ítems registrados. Agregue una fila por cada ítem efectivamente examinado de la muestra.
          </p>
          {!readOnly && (
            <button onClick={addRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" /> Agregar ítem
            </button>
          )}
        </div>
      ) : (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-b border-gray-100 flex-wrap">
            <span className="text-[11px] text-gray-500">
              {rows.length} {rows.length === 1 ? 'ítem' : 'ítems'} · {examinados} examinado{examinados === 1 ? '' : 's'}
            </span>
            {conError > 0 && (
              <span className="text-[11px] font-medium text-red-600">
                {conError} con diferencia · total {fmtUSD(totalDiff)}
              </span>
            )}
            <button
              onClick={() => setShowHelp(true)}
              className="ml-auto flex items-center gap-1 text-[10px] text-gray-400 hover:text-violet-600 transition-colors"
            >
              <HelpCircle className="w-3 h-3" /> ¿Cómo se calcula la diferencia?
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: '1200px' }}>
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
                  <SampleItemRowItem
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
                <Plus className="w-3.5 h-3.5" /> Agregar ítem
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
