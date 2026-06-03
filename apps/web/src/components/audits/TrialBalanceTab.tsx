'use client';

import { useState, useRef } from 'react';
import {
  Upload, BarChart3, CheckCircle2, AlertCircle, Trash2,
  ChevronDown, ChevronRight, Link2, Loader2, X, Search,
} from 'lucide-react';
import {
  useTrialBalances, useTrialBalance, useImportTrialBalance,
  useLinkTrialBalance, useDeleteTrialBalance, parseCsv,
  type TbAccount,
} from '@/hooks/useTrialBalance';
import { useWorkingPapersForAudit } from '@/hooks/useWorkingPapers';
import { formatDate } from '@/lib/utils';
import { BenfordPanel } from './BenfordPanel';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: string | number) {
  return Number(n).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function BalanceBadge({ isBalanced }: { isBalanced: boolean }) {
  return isBalanced ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="h-3 w-3" /> Cuadrado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
      <AlertCircle className="h-3 w-3" /> Descuadrado
    </span>
  );
}

// ─── Account selector for linking ────────────────────────────────────────────

function LinkToPaperModal({
  tbId, accounts, auditId, onClose,
}: {
  tbId: string;
  accounts: TbAccount[];
  auditId: string;
  onClose: () => void;
}) {
  const [paperId,      setPaperId]      = useState('');
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [note,         setNote]         = useState('');
  const [search,       setSearch]       = useState('');
  const { data: papers } = useWorkingPapersForAudit(auditId);
  const linkTb = useLinkTrialBalance(tbId);

  const filtered = accounts.filter(a =>
    a.code.toLowerCase().includes(search.toLowerCase()) ||
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(code: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  async function handleLink() {
    if (!paperId || selected.size === 0) return;
    await linkTb.mutateAsync({ paperId, accountCodes: [...selected], note });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-[#0F2D4A]">
          <p className="text-sm font-semibold text-white">Vincular cuentas a papel de trabajo</p>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Paper selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Papel de trabajo destino *</label>
            <select
              value={paperId}
              onChange={e => setPaperId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">— Seleccionar papel —</option>
              {(papers ?? []).map(p => (
                <option key={p.id} value={p.id}>[{p.code}] {p.title}</option>
              ))}
            </select>
          </div>

          {/* Account search + multi-select */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Cuentas a vincular ({selected.size} seleccionadas)
              </label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar cuenta..."
                  className="pl-6 pr-2 py-1 rounded-lg border border-slate-200 text-xs w-44"
                />
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-50">
              {filtered.map(acc => (
                <label
                  key={acc.code}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-violet-50/30 ${selected.has(acc.code) ? 'bg-violet-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(acc.code)}
                    onChange={() => toggle(acc.code)}
                    className="rounded border-slate-300 text-violet-600"
                  />
                  <span className="font-mono text-[11px] text-slate-500 w-20 flex-shrink-0">{acc.code}</span>
                  <span className="text-xs text-slate-700 flex-1 truncate">{acc.name}</span>
                  <span className={`text-[11px] font-semibold ${acc.balance < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                    {fmt(acc.balance)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nota (opcional)</label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Ej: Cuentas de efectivo y bancos analizadas en este papel"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            onClick={handleLink}
            disabled={!paperId || selected.size === 0 || linkTb.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0F2D4A] text-white text-sm font-medium disabled:opacity-50 hover:bg-[#1a4a7a]"
          >
            {linkTb.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Vincular {selected.size > 0 ? `${selected.size} cuenta${selected.size > 1 ? 's' : ''}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail view of one TB ────────────────────────────────────────────────────

function TrialBalanceDetail({ tbId, auditId, onBack }: { tbId: string; auditId: string; onBack: () => void }) {
  const { data: tb, isLoading } = useTrialBalance(tbId);
  const [showLink, setShowLink] = useState(false);
  const [search,   setSearch]  = useState('');
  const [innerTab, setInnerTab] = useState<'accounts' | 'benford'>('accounts');

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" /></div>;
  if (!tb) return null;

  const filtered = (tb.accounts as TbAccount[]).filter(a =>
    a.code.toLowerCase().includes(search.toLowerCase()) ||
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const linkedCodes = new Set(tb.paperLinks.flatMap(l => l.accountCodes as string[]));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
            ← Volver
          </button>
          <span className="text-slate-300">|</span>
          <p className="text-sm font-semibold text-slate-800">{tb.filename}</p>
          <span className="text-xs text-slate-400">· {tb.periodLabel}</span>
          <BalanceBadge isBalanced={tb.isBalanced} />
        </div>
        <button
          onClick={() => setShowLink(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-xs font-medium hover:bg-violet-100"
        >
          <Link2 className="h-3.5 w-3.5" /> Vincular a papel
        </button>
      </div>

      {/* Inner tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          onClick={() => setInnerTab('accounts')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            innerTab === 'accounts' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          📋 Cuentas
        </button>
        <button
          onClick={() => setInnerTab('benford')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            innerTab === 'benford' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          📈 Análisis Benford
        </button>
      </div>

      {/* Benford tab */}
      {innerTab === 'benford' && <BenfordPanel tbId={tbId} auditId={auditId} />}

      {/* Accounts tab content (unchanged) */}
      {innerTab === 'accounts' && <>
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Cuentas',    value: (tb.accounts as TbAccount[]).length, color: 'bg-slate-50 text-slate-700 border-slate-200' },
          { label: 'Total Debe', value: fmt(tb.totalDebit),  color: 'bg-blue-50 text-blue-700 border-blue-200' },
          { label: 'Total Haber',value: fmt(tb.totalCredit), color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
          { label: 'Vinculados', value: tb.paperLinks.length, color: 'bg-violet-50 text-violet-700 border-violet-200' },
        ].map(k => (
          <div key={k.label} className={`rounded-xl border p-3 ${k.color}`}>
            <p className="text-[10px] opacity-70">{k.label}</p>
            <p className="text-base font-bold mt-0.5 truncate">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Paper links summary */}
      {tb.paperLinks.length > 0 && (
        <div className="rounded-xl border border-violet-100 bg-violet-50/30 p-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider mb-2">Papeles vinculados</p>
          {tb.paperLinks.map(link => (
            <div key={link.id} className="flex items-center gap-2 text-xs">
              <span className="font-mono text-slate-500">[{link.paper.code}]</span>
              <span className="text-slate-700">{link.paper.title}</span>
              <span className="text-slate-400 ml-auto">{(link.accountCodes as string[]).length} ctas.</span>
            </div>
          ))}
        </div>
      )}

      {/* Account table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-slate-50">
          <p className="text-xs font-semibold text-slate-600">Cuentas</p>
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filtrar..."
              className="pl-6 pr-2 py-1 rounded-lg border border-slate-200 text-xs w-44"
            />
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-500 w-24">Código</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-500">Cuenta</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-500 w-28">Debe</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-500 w-28">Haber</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-500 w-28">Saldo</th>
                <th className="px-3 py-2 w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(acc => (
                <tr key={acc.code} className={`hover:bg-slate-50 ${linkedCodes.has(acc.code) ? 'bg-violet-50/40' : ''}`}>
                  <td className="px-3 py-2 font-mono text-slate-500">{acc.code}</td>
                  <td className="px-3 py-2 text-slate-700 truncate max-w-[200px]">{acc.name}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{acc.debit ? fmt(acc.debit) : '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{acc.credit ? fmt(acc.credit) : '—'}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${acc.balance < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                    {fmt(acc.balance)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {linkedCodes.has(acc.code) && (
                      <span title="Vinculada a papel">
                        <Link2 className="h-3 w-3 text-violet-400" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      </>}

      {showLink && (
        <LinkToPaperModal
          tbId={tbId}
          accounts={tb.accounts as TbAccount[]}
          auditId={auditId}
          onClose={() => setShowLink(false)}
        />
      )}
    </div>
  );
}

// ─── Main tab component ───────────────────────────────────────────────────────

export function TrialBalanceTab({ auditId }: { auditId: string }) {
  const { data: balances, isLoading } = useTrialBalances(auditId);
  const importTb     = useImportTrialBalance(auditId);
  const deleteTb     = useDeleteTrialBalance(auditId);
  const fileRef      = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [periodLabel, setPeriodLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [parseError, setParseError] = useState('');

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!periodLabel.trim()) { setParseError('Ingresa el período antes de subir'); return; }
    setParseError('');
    setUploading(true);
    try {
      const text = await file.text();
      const accounts = parseCsv(text);
      if (accounts.length === 0) {
        setParseError('No se pudieron detectar columnas (código, nombre, debe/haber). Revisa el formato CSV.');
        return;
      }
      await importTb.mutateAsync({ filename: file.name, periodLabel, accounts });
      setPeriodLabel('');
    } catch {
      setParseError('Error al procesar el archivo. Verifica que sea un CSV válido.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  if (selected) {
    return (
      <div className="p-4">
        <TrialBalanceDetail tbId={selected} auditId={auditId} onBack={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Upload area */}
      <div className="rounded-xl border-2 border-dashed border-slate-200 p-5 bg-slate-50/50">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="h-6 w-6 text-slate-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700">Importar Balance de Comprobación</p>
            <p className="text-xs text-slate-400 mt-0.5">CSV con columnas: código, nombre, debe, haber (o saldo)</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={periodLabel}
              onChange={e => setPeriodLabel(e.target.value)}
              placeholder="Período (ej: Diciembre 2024)"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs w-44"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading || importTb.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F2D4A] text-white text-xs font-medium hover:bg-[#1a4a7a] disabled:opacity-50"
            >
              {(uploading || importTb.isPending) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Subir CSV
            </button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
        {parseError && <p className="text-xs text-red-600 mt-2">{parseError}</p>}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
      ) : !balances?.length ? (
        <div className="py-16 text-center">
          <BarChart3 className="h-12 w-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No hay balances de comprobación importados</p>
          <p className="text-xs text-gray-400 mt-1">Sube un CSV para comenzar el análisis de cuentas</p>
        </div>
      ) : (
        <div className="space-y-2">
          {balances.map(tb => (
            <div
              key={tb.id}
              className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:border-blue-200 hover:bg-blue-50/20 cursor-pointer transition-all"
              onClick={() => setSelected(tb.id)}
            >
              <div className="h-10 w-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                <BarChart3 className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800 truncate">{tb.filename}</p>
                  <BalanceBadge isBalanced={tb.isBalanced} />
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {tb.periodLabel} · {formatDate(tb.importedAt)} · {tb._count.paperLinks} vínculos
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-slate-400">Debe</p>
                <p className="text-sm font-semibold text-slate-700">{fmt(tb.totalDebit)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-slate-400">Haber</p>
                <p className="text-sm font-semibold text-slate-700">{fmt(tb.totalCredit)}</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deleteTb.mutateAsync(tb.id); }}
                disabled={deleteTb.isPending}
                className="text-slate-300 hover:text-red-400 transition-colors p-1"
                title="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
