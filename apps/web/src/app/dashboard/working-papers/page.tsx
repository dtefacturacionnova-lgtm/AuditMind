'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FileText, Search, Plus, ChevronRight, ChevronDown, Bot,
  CheckCircle2, Clock, AlertCircle, AlertTriangle, Lock,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useWorkingPapersForOrg, useCreateWorkingPaper,
  WP_STATUS_CONFIG, WP_TYPE_CONFIG, INDEX_SECTIONS,
  type WpStatus, type WpType, type CreateWpData,
} from '@/hooks/useWorkingPapers';
import { formatDate } from '@/lib/utils';

const WP_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '',                      label: 'Todos los tipos' },
  { value: 'PLANNING_UNDERSTANDING',label: 'A — Planificación' },
  { value: 'CONTROL_EVALUATION',    label: 'B — Control' },
  { value: 'SUBSTANTIVE_TEST',      label: 'C — Prueba Sustantiva' },
  { value: 'SPECIALIST_WORK',       label: 'D — Especialista' },
  { value: 'CLOSING_PROCEDURES',    label: 'E — Cierre' },
  { value: 'ADMINISTRATIVE',        label: 'AD — Administrativo' },
];

const STATUS_ICONS: Partial<Record<WpStatus, React.ElementType>> = {
  // Legacy
  DRAFT:          Clock,
  IN_REVIEW:      AlertCircle,
  APPROVED:       CheckCircle2,
  ARCHIVED:       Lock,
  // New
  NOT_STARTED:    Clock,
  IN_PROGRESS:    AlertCircle,
  PENDING_REVIEW: AlertCircle,
  RETURNED:       AlertTriangle,
  REVIEWED:       CheckCircle2,
  SIGNED_OFF:     CheckCircle2,
  CLOSED:         Lock,
};

// ─── Create modal ─────────────────────────────────────────────────────────────
function CreateWpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<CreateWpData>({
    auditId: '', title: '', type: 'CONTROL_EVALUATION', indexSection: 'B',
  });
  const create = useCreateWorkingPaper();

  const TYPE_SECTION_MAP: Record<WpType, string> = {
    PLANNING_UNDERSTANDING: 'A',
    CONTROL_EVALUATION:     'B',
    SUBSTANTIVE_TEST:       'C',
    DATA_ANALYSIS:          'AD',
    FINDING:                'D',
    CLOSURE_CONCLUSION:     'E',
    INTERVIEW:              'I',
    CONFIRMATION:           'CF',
    NORMATIVE_ANALYSIS:     'N',
  };

  if (!open) return null;

  const handleTypeChange = (type: WpType) => {
    setForm(p => ({ ...p, type, indexSection: TYPE_SECTION_MAP[type] ?? p.indexSection }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync(form);
      onClose();
      setForm({ auditId: '', title: '', type: 'CONTROL_EVALUATION', indexSection: 'B' });
    } catch { /* error shown below */ }
  };

  const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const field = (label: string, node: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {node}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 mx-4">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Nuevo papel de trabajo</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {field('ID de Auditoría *',
            <input required value={form.auditId} onChange={e => setForm(p => ({ ...p, auditId: e.target.value }))}
              placeholder="ej. clxxx..." className={inputCls} />
          )}
          {field('Título *',
            <input required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="ej. Prueba de controles de tesorería" className={inputCls} />
          )}
          {field('Tipo *',
            <select value={form.type} onChange={e => handleTypeChange(e.target.value as WpType)} className={inputCls + ' bg-white'}>
              {Object.entries(WP_TYPE_CONFIG).filter(([k]) => k !== 'NORMATIVE_ANALYSIS').map(([k, v]) => (
                <option key={k} value={k}>{v.section} — {v.label}</option>
              ))}
            </select>
          )}
          {field('Sección / Índice',
            <input value={form.indexSection} onChange={e => setForm(p => ({ ...p, indexSection: e.target.value }))}
              placeholder="A, B, C, D, E, AD" className={inputCls} />
          )}

          {create.isError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {(create.error as Error)?.message ?? 'Error al crear'}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={create.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {create.isPending ? 'Creando...' : 'Crear papel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Section group row ────────────────────────────────────────────────────────
function SectionGroup({ sectionKey, papers }: { sectionKey: string; papers: WorkingPaper[] }) {
  const [open, setOpen] = useState(true);
  const sec = INDEX_SECTIONS.find(s => s.key === sectionKey);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-600 text-white text-xs font-bold">
          {sectionKey}
        </span>
        <div className="flex-1 text-left">
          <span className="text-sm font-semibold text-gray-800">
            {sec?.label ?? `Sección ${sectionKey}`}
          </span>
          <span className="ml-2 text-xs text-gray-400">{papers.length} papel{papers.length !== 1 ? 'es' : ''}</span>
        </div>
        <div className="flex gap-1.5">
          {papers.some(p => p.status === 'APPROVED') && (
            <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              {papers.filter(p => p.status === 'APPROVED').length} aprobados
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="divide-y divide-gray-100">
          {papers.map(wp => {
            const st      = WP_STATUS_CONFIG[wp.status];
            const typeConf = WP_TYPE_CONFIG[wp.type];
            const StatusIcon = STATUS_ICONS[wp.status] ?? FileText;
            return (
              <Link
                key={wp.id}
                href={`/dashboard/working-papers/${wp.id}`}
                className="flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 transition-colors group"
              >
                {/* Code */}
                <span className="w-14 shrink-0 text-sm font-mono font-bold text-blue-700">{wp.code}</span>

                {/* Title */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-600 transition-colors">
                    {wp.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs ${typeConf.color}`}>{typeConf.label}</span>
                    {wp.audit && <span className="text-xs text-gray-400">· {wp.audit.title}</span>}
                  </div>
                </div>

                {/* AI badge */}
                {wp.aiAssisted && (
                  <span className="flex items-center gap-1 text-[10px] text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                    <Bot className="w-2.5 h-2.5" /> IA
                  </span>
                )}

                {/* Counts */}
                {wp._count && (
                  <div className="hidden sm:flex items-center gap-3 text-xs text-gray-400">
                    {wp._count.tickEntries > 0 && <span>✓ {wp._count.tickEntries}</span>}
                    {wp._count.findings    > 0 && <span className="text-orange-500">⚑ {wp._count.findings}</span>}
                    {wp._count.comments    > 0 && <span>💬 {wp._count.comments}</span>}
                  </div>
                )}

                {/* Prepared by */}
                {wp.preparedBy && (
                  <span className="hidden lg:block text-xs text-gray-500 max-w-[100px] truncate">
                    {wp.preparedBy.name}
                  </span>
                )}

                {/* Status */}
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.color}`}>
                  <StatusIcon className="w-3 h-3" />
                  {st.label}
                </span>

                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
// Forward WorkingPaper type from hook
import type { WorkingPaper } from '@/hooks/useWorkingPapers';

export default function WorkingPapersPage() {
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('');
  const [page, setPage]           = useState(1);
  const [showCreate, setCreate]   = useState(false);

  const { data, isLoading } = useWorkingPapersForOrg({
    status: statusFilter as WpStatus || undefined,
    page,
    limit: 50,
  });

  const papers = data?.data ?? [];
  const meta   = data?.meta;

  const filtered = search
    ? papers.filter(p =>
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.code.toLowerCase().includes(search.toLowerCase()) ||
        p.audit?.title?.toLowerCase().includes(search.toLowerCase()),
      )
    : papers;

  // Group by indexSection
  const grouped = filtered.reduce<Record<string, WorkingPaper[]>>((acc, wp) => {
    acc[wp.indexSection] = acc[wp.indexSection] ?? [];
    acc[wp.indexSection].push(wp);
    return acc;
  }, {});

  const orderedKeys = ['A', 'B', 'C', 'D', 'E', 'AD', 'I', 'CF', 'N', ...Object.keys(grouped).filter(k => !['A','B','C','D','E','AD','I','CF','N'].includes(k))];
  const presentKeys = orderedKeys.filter(k => grouped[k]);

  // KPIs
  const draftCount    = papers.filter(p => p.status === 'DRAFT').length;
  const reviewCount   = papers.filter(p => p.status === 'IN_REVIEW').length;
  const approvedCount = papers.filter(p => p.status === 'APPROVED').length;

  return (
    <div className="flex flex-col h-full">
      <Header title="Papeles de Trabajo" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'En borrador',  value: draftCount,    icon: Clock,       color: 'text-gray-500',    bg: 'bg-gray-50' },
            { label: 'En revisión',  value: reviewCount,   icon: AlertCircle, color: 'text-amber-500',   bg: 'bg-amber-50' },
            { label: 'Aprobados',    value: approvedCount, icon: CheckCircle2,color: 'text-emerald-500', bg: 'bg-emerald-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-800">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters + New button */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar por código, título o auditoría..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => { setStatus(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Todos los estados</option>
              <option value="DRAFT">Borrador</option>
              <option value="IN_REVIEW">En Revisión</option>
              <option value="APPROVED">Aprobado</option>
              <option value="FINAL">Final</option>
            </select>
            <button
              onClick={() => setCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Nuevo PT
            </button>
          </div>
        </div>

        {/* Index tree */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 bg-white border border-gray-200 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : presentKeys.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-xl border border-gray-200">
            <FileText className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No hay papeles de trabajo</p>
            <p className="text-gray-400 text-sm mt-1 mb-4">
              {search || statusFilter ? 'Prueba con otros filtros' : 'Crea el primer papel de trabajo'}
            </p>
            {!search && !statusFilter && (
              <button
                onClick={() => setCreate(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" /> Nuevo PT
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {presentKeys.map(key => (
              <SectionGroup key={key} sectionKey={key} papers={grouped[key]} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">{meta.total} papeles en total</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                Anterior
              </button>
              <span className="px-3 py-1 text-xs text-gray-500">{page} / {meta.totalPages}</span>
              <button onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))} disabled={page >= meta.totalPages}
                className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                Siguiente
              </button>
            </div>
          </div>
        )}

      </div>

      <CreateWpModal open={showCreate} onClose={() => setCreate(false)} />
    </div>
  );
}
