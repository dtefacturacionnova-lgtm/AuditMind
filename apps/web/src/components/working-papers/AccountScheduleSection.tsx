'use client';

import { useRef, useState } from 'react';
import {
  Paperclip, Plus, Trash2, X, FileText, Image as ImageIcon,
  FileSpreadsheet, File as FileGeneric, Loader2, Download, Search,
  CheckSquare, Square, ChevronDown,
} from 'lucide-react';
import {
  useAttachToAccountSchedule,
  useRemoveAccountScheduleAttachment,
  useTbAccounts,
} from '@/hooks/useWorkingPaperGraph';
import type { TbAccount } from '@/hooks/useWorkingPaperGraph';
import type { EvidenceAttachment } from './DocumentEvidencePanel';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccountScheduleRow {
  id:                string;
  accountCode:       string;
  accountName:       string;
  balanceCurrent:    number;
  adjustments:       number;
  reclassifications: number;
  tickMark:          string;   // audit tick mark
  notes:             string;
  attachments:       EvidenceAttachment[];
}

interface Props {
  paperId:  string;
  rows:     AccountScheduleRow[];
  onChange: (rows: AccountScheduleRow[]) => void;
  readOnly?: boolean;
}

// ─── Tick marks ───────────────────────────────────────────────────────────────

const TICK_MARKS: { value: string; label: string; color: string }[] = [
  { value: '✓',  label: 'Verificado',          color: 'text-emerald-700 bg-emerald-50 border-emerald-300' },
  { value: 'Σ',  label: 'Sumatoria verificada', color: 'text-blue-700   bg-blue-50   border-blue-300'    },
  { value: 'C',  label: 'Confirmado (circ.)',   color: 'text-indigo-700  bg-indigo-50  border-indigo-300'  },
  { value: 'A',  label: 'Con ajuste',           color: 'text-amber-700  bg-amber-50  border-amber-300'   },
  { value: 'E',  label: 'Estimación',           color: 'text-orange-700 bg-orange-50 border-orange-300'  },
  { value: 'R',  label: 'Recalculado',          color: 'text-purple-700 bg-purple-50 border-purple-300'  },
  { value: '✕',  label: 'Excepción',            color: 'text-red-700    bg-red-50    border-red-300'     },
  { value: '—',  label: 'No aplica',            color: 'text-gray-500   bg-gray-50   border-gray-300'    },
];

function TickMarkSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = TICK_MARKS.find(m => m.value === value);

  if (disabled) {
    return selected ? (
      <span
        className={`inline-flex items-center justify-center w-6 h-6 rounded border text-xs font-bold ${selected.color}`}
        title={selected.label}
      >
        {selected.value}
      </span>
    ) : (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded border border-dashed border-gray-200 text-gray-300 text-xs">
        —
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded border text-xs font-bold transition-colors ${
          selected ? selected.color : 'text-gray-400 bg-white border-gray-200 hover:border-gray-300'
        }`}
        title="Seleccionar marca de auditoría"
      >
        <span className="w-4 text-center">{selected?.value ?? '·'}</span>
        <ChevronDown className="w-2.5 h-2.5 opacity-50" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 left-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg p-1.5 min-w-[160px]">
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide px-1.5 pb-1">
              Marcas de auditoría
            </p>
            {TICK_MARKS.map(m => (
              <button
                key={m.value}
                type="button"
                onClick={() => { onChange(value === m.value ? '' : m.value); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors hover:bg-gray-50 ${
                  value === m.value ? 'font-semibold' : ''
                }`}
              >
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded border text-[11px] font-bold shrink-0 ${m.color}`}>
                  {m.value}
                </span>
                <span className="text-gray-700">{m.label}</span>
                {value === m.value && <X className="w-3 h-3 ml-auto text-gray-400" />}
              </button>
            ))}
            {value && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); }}
                className="w-full text-left px-2 py-1 text-[10px] text-gray-400 hover:text-red-500 transition-colors mt-0.5 border-t border-gray-100"
              >
                Quitar marca
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Import from B-00 modal ───────────────────────────────────────────────────

function ImportTbModal({
  paperId,
  existingCodes,
  onImport,
  onClose,
}: {
  paperId:       string;
  existingCodes: Set<string>;
  onImport:      (accounts: TbAccount[]) => void;
  onClose:       () => void;
}) {
  const { data, isLoading } = useTbAccounts(paperId);
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter,   setFilter]   = useState<string>('');   // sub_sumaria filter

  const accounts   = data?.accounts ?? [];
  const subSumarias = [...new Set(accounts.map(a => a.sub_sumaria).filter(Boolean))].sort();

  const filtered = accounts.filter(a => {
    const matchesSearch = !search ||
      a.cuenta.includes(search) ||
      a.descripcion.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = !filter || a.sub_sumaria === filter;
    return matchesSearch && matchesFilter;
  });

  const newAccounts = filtered.filter(a => !existingCodes.has(a.cuenta));

  function toggleAll() {
    if (selected.size === newAccounts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(newAccounts.map(a => a.cuenta)));
    }
  }

  function toggle(cuenta: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(cuenta)) next.delete(cuenta);
      else next.add(cuenta);
      return next;
    });
  }

  function handleImport() {
    const toImport = accounts.filter(a => selected.has(a.cuenta));
    onImport(toImport);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-semibold text-gray-800">Importar desde Balance de Comprobación</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {data?.message ?? 'Cargando cuentas…'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 border-b border-gray-100 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por código o nombre…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
          {subSumarias.length > 0 && (
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white text-gray-700"
            >
              <option value="">Todas las sumarias</option>
              {subSumarias.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
        </div>

        {/* Account list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-gray-400">
              {accounts.length === 0
                ? 'No hay cuentas en B-00. Cargue el Balance de Comprobación primero.'
                : 'No hay cuentas que coincidan con el filtro.'}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <button type="button" onClick={toggleAll} className="text-gray-400 hover:text-blue-600 transition-colors">
                      {selected.size === newAccounts.length && newAccounts.length > 0
                        ? <CheckSquare className="w-3.5 h-3.5" />
                        : <Square className="w-3.5 h-3.5" />}
                    </button>
                  </th>
                  <th className="px-2 py-2 text-left font-semibold text-gray-500 w-24">Código</th>
                  <th className="px-2 py-2 text-left font-semibold text-gray-500">Nombre</th>
                  <th className="px-2 py-2 text-right font-semibold text-gray-500 w-24">Saldo actual</th>
                  <th className="px-2 py-2 text-left font-semibold text-gray-500 w-20">Sumaria</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const alreadyIn = existingCodes.has(a.cuenta);
                  return (
                    <tr
                      key={a.cuenta}
                      className={`border-b border-gray-50 transition-colors ${
                        alreadyIn
                          ? 'opacity-40 cursor-not-allowed'
                          : 'hover:bg-blue-50/30 cursor-pointer'
                      }`}
                      onClick={() => !alreadyIn && toggle(a.cuenta)}
                    >
                      <td className="px-3 py-2">
                        {alreadyIn ? (
                          <span className="text-[9px] text-gray-400 font-medium">ya</span>
                        ) : (
                          <button type="button" className="text-gray-300 hover:text-blue-600 transition-colors">
                            {selected.has(a.cuenta)
                              ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                              : <Square className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2 font-mono text-gray-700">{a.cuenta}</td>
                      <td className="px-2 py-2 text-gray-800">{a.descripcion}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-gray-700">
                        {a.saldo_actual.toLocaleString('es-SV', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-2">
                        <span className="text-[10px] font-mono bg-blue-50 text-blue-600 border border-blue-200 px-1 py-0.5 rounded">
                          {a.sub_sumaria}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
          <span className="text-xs text-gray-500">
            {selected.size > 0
              ? `${selected.size} cuenta${selected.size !== 1 ? 's' : ''} seleccionada${selected.size !== 1 ? 's' : ''}`
              : 'Selecciona las cuentas a importar'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:border-gray-300 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={selected.size === 0}
              className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Importar {selected.size > 0 ? selected.size : ''} cuenta{selected.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newRow(): AccountScheduleRow {
  return {
    id:                `as_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    accountCode:       '',
    accountName:       '',
    balanceCurrent:    0,
    adjustments:       0,
    reclassifications: 0,
    tickMark:          '',
    notes:             '',
    attachments:       [],
  };
}

function rowFromTb(account: TbAccount): AccountScheduleRow {
  return {
    id:                `as_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}_${account.cuenta}`,
    accountCode:       account.cuenta,
    accountName:       account.descripcion,
    balanceCurrent:    account.saldo_actual,
    adjustments:       0,
    reclassifications: 0,
    tickMark:          '',
    notes:             '',
    attachments:       [],
  };
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('es-SV', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
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
  return <FileGeneric className="w-3.5 h-3.5 shrink-0 text-gray-400" />;
}

// ─── NumberInput ──────────────────────────────────────────────────────────────

function NumInput({ value, onChange, disabled }: {
  value: number; onChange: (v: number) => void; disabled: boolean;
}) {
  const [local, setLocal] = useState(String(value));

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setLocal(e.target.value);
  }

  function handleBlur() {
    const parsed = parseFloat(local.replace(/,/g, ''));
    const next = isNaN(parsed) ? 0 : parsed;
    setLocal(String(next));
    onChange(next);
  }

  return (
    <input
      type="text"
      value={local}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      className="w-full text-xs text-right text-gray-800 bg-transparent border-b border-transparent
        hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5 tabular-nums
        placeholder:text-gray-300 transition-colors disabled:cursor-default"
    />
  );
}

// ─── Row component ─────────────────────────────────────────────────────────────

interface RowProps {
  row:      AccountScheduleRow;
  index:    number;
  paperId:  string;
  readOnly: boolean;
  onUpdate: (patch: Partial<AccountScheduleRow>) => void;
  onDelete: () => void;
}

function ScheduleRow({ row, index, paperId, readOnly, onUpdate, onDelete }: RowProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving]   = useState<string | null>(null);

  const attachMutation = useAttachToAccountSchedule();
  const removeMutation = useRemoveAccountScheduleAttachment();

  const adjustedBalance = row.balanceCurrent + row.adjustments + row.reclassifications;

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const att = await attachMutation.mutateAsync({ paperId, rowId: row.id, file });
      onUpdate({ attachments: [...row.attachments, att] });
    } catch (e) {
      alert('Error al subir: ' + (e as Error).message);
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
      alert('Error al quitar: ' + (e as Error).message);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <tr className="group border-b border-gray-100 last:border-0 align-top hover:bg-blue-50/20 transition-colors">
      {/* # */}
      <td className="px-3 py-2.5 w-8">
        <span className="text-xs text-gray-400 font-mono tabular-nums">{index + 1}</span>
      </td>

      {/* Marca de auditoría */}
      <td className="px-2 py-2.5 w-12">
        <TickMarkSelector
          value={row.tickMark ?? ''}
          onChange={v => onUpdate({ tickMark: v })}
          disabled={readOnly}
        />
      </td>

      {/* Código */}
      <td className="px-2 py-2.5 w-24">
        <input
          type="text"
          value={row.accountCode}
          onChange={e => onUpdate({ accountCode: e.target.value })}
          disabled={readOnly}
          placeholder="1101"
          className="w-full text-xs font-mono text-gray-700 bg-transparent border-b border-transparent
            hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5
            placeholder:text-gray-300 transition-colors disabled:cursor-default"
        />
      </td>

      {/* Nombre de cuenta */}
      <td className="px-2 py-2.5 min-w-[160px]">
        <input
          type="text"
          value={row.accountName}
          onChange={e => onUpdate({ accountName: e.target.value })}
          disabled={readOnly}
          placeholder="Nombre de la cuenta…"
          className="w-full text-xs text-gray-800 bg-transparent border-b border-transparent
            hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5
            placeholder:text-gray-300 transition-colors disabled:cursor-default"
        />
      </td>

      {/* Saldo al Cierre */}
      <td className="px-2 py-2.5 w-28">
        <NumInput
          value={row.balanceCurrent}
          onChange={v => onUpdate({ balanceCurrent: v })}
          disabled={readOnly}
        />
      </td>

      {/* Ajustes */}
      <td className="px-2 py-2.5 w-28">
        <NumInput
          value={row.adjustments}
          onChange={v => onUpdate({ adjustments: v })}
          disabled={readOnly}
        />
      </td>

      {/* Reclasificaciones */}
      <td className="px-2 py-2.5 w-28">
        <NumInput
          value={row.reclassifications}
          onChange={v => onUpdate({ reclassifications: v })}
          disabled={readOnly}
        />
      </td>

      {/* Saldo Ajustado — computed */}
      <td className="px-2 py-2.5 w-28 bg-emerald-50/60">
        <span className="block text-xs text-right tabular-nums font-semibold text-emerald-700">
          {fmtCurrency(adjustedBalance)}
        </span>
      </td>

      {/* Notas */}
      <td className="px-2 py-2.5 min-w-[140px]">
        <textarea
          value={row.notes}
          onChange={e => onUpdate({ notes: e.target.value })}
          disabled={readOnly}
          rows={2}
          placeholder="Notas de auditoría…"
          className="w-full text-xs text-gray-700 bg-transparent border-b border-transparent
            hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5
            placeholder:text-gray-300 resize-none transition-colors disabled:cursor-default"
        />
      </td>

      {/* Evidencias */}
      <td className="px-2 py-2.5 w-52">
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
                className="text-xs text-blue-600 hover:underline truncate max-w-[90px]"
                title={att.filename}
              >
                {att.filename}
              </a>
              <span className="text-[10px] text-gray-400 shrink-0">
                {fmtSize(att.size)}
              </span>
              {!readOnly && (
                <button
                  onClick={() => handleRemove(att.id)}
                  disabled={removing === att.id}
                  className="ml-auto opacity-0 group-hover/chip:opacity-100 text-gray-400 hover:text-red-500 transition-all disabled:opacity-50"
                  title="Quitar adjunto"
                >
                  {removing === att.id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <X className="w-3 h-3" />}
                </button>
              )}
            </div>
          ))}

          {!readOnly && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.xls,.csv,.docx,.doc,.txt,.zip"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700
                  border border-dashed border-blue-200 hover:border-blue-400 rounded-md px-2 py-1
                  transition-colors disabled:opacity-50 mt-0.5"
              >
                {uploading
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Paperclip className="w-3 h-3" />}
                Adjuntar
              </button>
            </>
          )}
        </div>
      </td>

      {/* Eliminar fila */}
      {!readOnly && (
        <td className="px-2 py-2.5 w-8">
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

// ─── Tick mark legend ──────────────────────────────────────────────────────────

function TickMarkLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2 bg-gray-50 border-t border-gray-100">
      <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide self-center mr-1">Marcas:</span>
      {TICK_MARKS.map(m => (
        <span key={m.value} className="flex items-center gap-1 text-[10px] text-gray-500">
          <span className={`inline-flex items-center justify-center w-4 h-4 rounded border text-[10px] font-bold ${m.color}`}>
            {m.value}
          </span>
          {m.label}
        </span>
      ))}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AccountScheduleSection({ paperId, rows, onChange, readOnly = false }: Props) {
  const [showImport, setShowImport] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  const existingCodes = new Set(rows.map(r => r.accountCode).filter(Boolean));

  function addRow() {
    onChange([...rows, newRow()]);
  }

  function updateRow(id: string, patch: Partial<AccountScheduleRow>) {
    onChange(rows.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  function deleteRow(id: string) {
    onChange(rows.filter(r => r.id !== id));
  }

  function importAccounts(accounts: TbAccount[]) {
    const newRows = accounts.map(rowFromTb);
    onChange([...rows, ...newRows]);
  }

  const totCurrent    = rows.reduce((s, r) => s + (r.balanceCurrent    ?? 0), 0);
  const totAdjust     = rows.reduce((s, r) => s + (r.adjustments       ?? 0), 0);
  const totReclass    = rows.reduce((s, r) => s + (r.reclassifications ?? 0), 0);
  const totAdjusted   = totCurrent + totAdjust + totReclass;

  const colCount = readOnly ? 10 : 11;

  return (
    <>
      {showImport && (
        <ImportTbModal
          paperId={paperId}
          existingCodes={existingCodes}
          onImport={importAccounts}
          onClose={() => setShowImport(false)}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        {/* Toolbar */}
        {!readOnly && (
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800
                  border border-blue-200 hover:border-blue-400 rounded-lg px-2.5 py-1
                  font-medium transition-colors bg-white"
              >
                <Download className="w-3.5 h-3.5" />
                Cargar de B-00
              </button>
              <button
                onClick={() => setShowLegend(l => !l)}
                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                <span>Leyenda de marcas</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showLegend ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <span className="text-[10px] text-gray-400">
              {rows.length} cuenta{rows.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {showLegend && <TickMarkLegend />}

        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2.5 text-left font-semibold text-gray-500 w-8">#</th>
              <th className="px-2 py-2.5 text-center font-semibold text-gray-600 w-12" title="Marca de auditoría">Marca</th>
              <th className="px-2 py-2.5 text-left font-semibold text-gray-600 w-24">Código</th>
              <th className="px-2 py-2.5 text-left font-semibold text-gray-600 min-w-[160px]">Nombre de Cuenta</th>
              <th className="px-2 py-2.5 text-right font-semibold text-gray-600 w-28">Saldo al Cierre</th>
              <th className="px-2 py-2.5 text-right font-semibold text-gray-600 w-28">
                Ajustes <span className="font-normal text-gray-400">Dr/(Cr)</span>
              </th>
              <th className="px-2 py-2.5 text-right font-semibold text-gray-600 w-28">Reclasif.</th>
              <th className="px-2 py-2.5 text-right font-semibold text-emerald-700 w-28 bg-emerald-50/60">
                Saldo Ajustado
              </th>
              <th className="px-2 py-2.5 text-left font-semibold text-gray-600 min-w-[140px]">Notas</th>
              <th className="px-2 py-2.5 text-left font-semibold text-gray-600 w-52">Evidencias</th>
              {!readOnly && <th className="px-2 py-2.5 w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-6 text-center text-xs text-gray-400 italic"
                >
                  Sin cuentas.{' '}
                  {!readOnly && (
                    <>
                      Usa{' '}
                      <button
                        type="button"
                        onClick={() => setShowImport(true)}
                        className="text-blue-500 hover:underline"
                      >
                        Cargar de B-00
                      </button>
                      {' '}o haz clic en "Agregar cuenta" para comenzar.
                    </>
                  )}
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <ScheduleRow
                key={row.id}
                row={row}
                index={i}
                paperId={paperId}
                readOnly={readOnly}
                onUpdate={patch => updateRow(row.id, patch)}
                onDelete={() => deleteRow(row.id)}
              />
            ))}
          </tbody>

          {/* Totals row */}
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                <td colSpan={4} className="px-3 py-2 text-xs text-gray-600 text-right">
                  Totales
                </td>
                <td className="px-2 py-2 text-right text-xs tabular-nums text-gray-700">
                  {fmtCurrency(totCurrent)}
                </td>
                <td className="px-2 py-2 text-right text-xs tabular-nums text-gray-700">
                  {fmtCurrency(totAdjust)}
                </td>
                <td className="px-2 py-2 text-right text-xs tabular-nums text-gray-700">
                  {fmtCurrency(totReclass)}
                </td>
                <td className="px-2 py-2 text-right text-xs tabular-nums font-bold text-emerald-700 bg-emerald-50/60">
                  {fmtCurrency(totAdjusted)}
                </td>
                <td colSpan={readOnly ? 2 : 3} />
              </tr>
            </tfoot>
          )}
        </table>

        {!readOnly && (
          <div className="px-3 py-2.5 border-t border-gray-100 bg-white">
            <button
              onClick={addRow}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800
                font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar cuenta
            </button>
          </div>
        )}
      </div>
    </>
  );
}
