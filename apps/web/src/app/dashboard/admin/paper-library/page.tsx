'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BookMarked, Eye, EyeOff, Library, Loader2, Pencil, Plus, Search, Trash2, Undo2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useUser } from '@/hooks/useUser';
import {
  AUDIT_TYPE_LABEL, PRIORITY_LABEL,
  useCreateLibraryItem, useDeleteLibraryItem, useOverrideBaseItem, usePaperLibrary, usePaperLibraryList, useRestoreBaseItem, useUpdateLibraryItem,
  type LibraryItem, type LibraryItemInput, type LibraryOrigin, type PaperLibrarySummary,
} from '@/hooks/usePaperLibrary';
import { PaperLibraryItemForm, errorText } from '@/components/working-papers/PaperLibraryItemForm';

const ORIGIN_BADGE: Record<LibraryOrigin, { text: string; cls: string; tip: string }> = {
  BASE: { text: 'Del sistema', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', tip: 'Viene con la plataforma; se actualiza con cada versión.' },
  EDITED: { text: 'Ajustado', cls: 'bg-amber-50 text-amber-700 border-amber-200', tip: 'Del sistema, con el texto que tu organización le puso. Puedes restaurar el original.' },
  OWN: { text: 'Propio', cls: 'bg-violet-50 text-violet-700 border-violet-200', tip: 'Lo creó tu organización.' },
};
const PRIORITY_CLS = { HIGH: 'text-red-600', MEDIUM: 'text-amber-600', LOW: 'text-gray-500' } as const;

function ItemRow({ paperCode, item, canEdit }: { paperCode: string; item: LibraryItem; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const override = useOverrideBaseItem();
  const restore = useRestoreBaseItem();
  const update = useUpdateLibraryItem();
  const remove = useDeleteLibraryItem();
  const busy = override.isPending || restore.isPending || update.isPending || remove.isPending;
  const badge = ORIGIN_BADGE[item.origin];

  function save(data: LibraryItemInput) {
    setError(null);
    const done = { onSuccess: () => setEditing(false), onError: (e: unknown) => setError(errorText(e)) };
    if (item.origin === 'OWN' && item.rowId) update.mutate({ rowId: item.rowId, data }, done);
    else override.mutate({ paperCode, baseId: item.id, content: data }, done);
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-violet-200 bg-white p-4">
        <PaperLibraryItemForm
          initial={item}
          submitLabel="Guardar cambios"
          saving={override.isPending || update.isPending}
          error={error}
          hint={item.origin === 'OWN' ? undefined : 'Estás ajustando un procedimiento del sistema solo para tu organización. El original sigue disponible: puedes restaurarlo cuando quieras.'}
          onSubmit={save}
          onCancel={() => { setEditing(false); setError(null); }}
        />
      </div>
    );
  }

  return (
    <div className={`rounded-xl border bg-white ${item.hidden ? 'border-dashed border-gray-300 opacity-70' : 'border-gray-200'}`}>
      <div className="flex items-start gap-3 p-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-sm font-semibold ${item.hidden ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{item.title}</span>
            <span title={badge.tip} className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.text}</span>
            {item.hidden && <span className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">Oculto</span>}
            {item.ref && <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] text-blue-700">{item.ref}</span>}
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {item.technique} · Prioridad <span className={`font-semibold ${PRIORITY_CLS[item.priority]}`}>{PRIORITY_LABEL[item.priority]}</span>
            {item.auditTypes && item.auditTypes.length > 0 && <> · Solo: {item.auditTypes.map((t) => AUDIT_TYPE_LABEL[t] ?? t).join(', ')}</>}
          </p>
        </button>

        {canEdit && (
          <div className="flex shrink-0 items-center gap-0.5">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
            <button type="button" title="Editar" disabled={busy} onClick={() => setEditing(true)}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-40"><Pencil className="h-3.5 w-3.5" /></button>
            {item.origin !== 'OWN' && (
              <button type="button" disabled={busy}
                title={item.hidden ? 'Volver a mostrar en las sugerencias' : 'Ocultar: deja de sugerirse en tu organización'}
                onClick={() => override.mutate({ paperCode, baseId: item.id, hidden: !item.hidden })}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40">
                {item.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
            )}
            {item.origin === 'OWN' && (
              <button type="button" title="Eliminar" disabled={busy}
                onClick={() => { if (item.rowId && confirm(`¿Eliminar «${item.title}» de la biblioteca de tu organización?`)) remove.mutate(item.rowId); }}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
            )}
            {item.origin === 'EDITED' && (
              <button type="button" title="Restaurar el texto original del sistema" disabled={busy}
                onClick={() => { if (confirm(`¿Restaurar «${item.original?.title ?? item.title}» al texto original del sistema? Se pierde tu ajuste.`)) restore.mutate({ paperCode, baseId: item.id }); }}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-40"><Undo2 className="h-3.5 w-3.5" /></button>
            )}
          </div>
        )}
      </div>

      {open && (
        <div className="space-y-2 border-t border-gray-100 px-4 pb-3 pt-2 text-sm text-gray-700">
          <div><p className="text-[10px] font-semibold uppercase text-gray-400">Enunciado</p><p className="whitespace-pre-line">{item.statement}</p></div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5">
            <p className="mb-0.5 text-[10px] font-semibold uppercase text-emerald-700">Desarrollo modelo</p>
            <p className="whitespace-pre-line text-xs">{item.development}</p>
          </div>
          {item.origin === 'EDITED' && item.original && (
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer">Ver el texto original del sistema</summary>
              <p className="mt-1 font-semibold">{item.original.title}</p>
              <p className="whitespace-pre-line">{item.original.statement}</p>
              <p className="mt-1 whitespace-pre-line">{item.original.development}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function NewItem({ paperCode }: { paperCode: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateLibraryItem();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100">
        <Plus className="h-3.5 w-3.5" /> Nuevo procedimiento propio
      </button>
    );
  }
  return (
    <div className="rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/30 p-4">
      <PaperLibraryItemForm
        submitLabel="Agregar a la biblioteca"
        saving={create.isPending}
        error={error}
        onSubmit={(data) => {
          setError(null);
          create.mutate({ paperCode, data }, { onSuccess: () => setOpen(false), onError: (e) => setError(errorText(e)) });
        }}
        onCancel={() => { setOpen(false); setError(null); }}
      />
    </div>
  );
}

function PaperDetail({ paperCode, canEdit }: { paperCode: string; canEdit: boolean }) {
  const { data, isLoading, error } = usePaperLibrary(paperCode);
  if (isLoading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>;
  if (error || !data) return <p role="alert" className="p-6 text-sm text-red-600">{errorText(error)}</p>;
  const visibles = data.items.filter((i) => !i.hidden).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900"><span className="font-mono">{data.paperCode}</span>{data.title ? ` — ${data.title}` : ''}</h2>
          <p className="text-xs text-gray-500">
            {visibles} de {data.items.length} se sugieren hoy · {data.hasBase ? `base del sistema revisada ${data.reviewedAt}` : 'este papel no trae biblioteca del sistema: solo procedimientos propios'}
          </p>
        </div>
        {canEdit && <NewItem paperCode={data.paperCode} />}
      </div>
      {data.items.length === 0 && <p className="py-8 text-center text-sm text-gray-400">Este papel aún no tiene procedimientos en la biblioteca.</p>}
      {data.items.map((it) => <ItemRow key={`${it.id}:${it.rowId ?? ''}`} paperCode={data.paperCode} item={it} canEdit={canEdit} />)}
    </div>
  );
}

function PaperList({ list, selected, onSelect }: { list: PaperLibrarySummary[]; selected: string | null; onSelect: (c: string) => void }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? list.filter((p) => p.paperCode.toLowerCase().includes(n) || (p.title ?? '').toLowerCase().includes(n)) : list;
  }, [list, q]);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar papel…" aria-label="Buscar papel"
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300" />
      </div>
      <ul className="space-y-1">
        {filtered.map((p) => (
          <li key={p.paperCode}>
            <button type="button" onClick={() => onSelect(p.paperCode)} aria-current={selected === p.paperCode}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${selected === p.paperCode ? 'border-violet-300 bg-violet-50' : 'border-transparent hover:bg-gray-50'}`}>
              <p className="font-mono text-xs font-semibold text-gray-800">{p.paperCode}</p>
              {p.title && <p className="truncate text-[11px] text-gray-500">{p.title}</p>}
              <p className="mt-0.5 text-[10px] text-gray-400">
                {p.baseCount} del sistema{p.ownCount > 0 && ` · ${p.ownCount} propios`}{p.editedCount > 0 && ` · ${p.editedCount} ajustados`}{p.hiddenCount > 0 && ` · ${p.hiddenCount} ocultos`}
              </p>
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="px-2 py-4 text-center text-xs text-gray-400">Ningún papel coincide.</li>}
      </ul>
    </div>
  );
}

export default function PaperLibraryAdminPage() {
  const { hasRole } = useUser();
  const canEdit = hasRole(['AUDIT_MANAGER']);
  const { data: list, isLoading, error } = usePaperLibraryList();
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? list?.[0]?.paperCode ?? null;

  return (
    <div className="flex h-full flex-col">
      <Header title="Biblioteca por Papel" breadcrumbs={[{ label: 'Administración' }, { label: 'Biblioteca por Papel' }]} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-3">
        <p className="max-w-3xl text-xs text-gray-500">
          Procedimientos con desarrollo modelo que «Generar sugerencias» ofrece primero, sin gastar IA. Lo del sistema se actualiza con cada versión;
          aquí lo ajustas, ocultas o completas con lo propio de tu organización.
          {!canEdit && ' Para editar necesitas ser Gerente de Auditoría o superior.'}
        </p>
        <Link href="/dashboard/admin/content-library" className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline">
          <Library className="h-3 w-3" /> Biblioteca de Contenido (sustantivos y COSO)
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>
        ) : error || !list ? (
          <p role="alert" className="text-sm text-red-600">{errorText(error)}</p>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <BookMarked className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500">Aún no hay bibliotecas por papel.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
            <PaperList list={list} selected={current} onSelect={setSelected} />
            <div>{current && <PaperDetail key={current} paperCode={current} canEdit={canEdit} />}</div>
          </div>
        )}
      </div>
    </div>
  );
}
