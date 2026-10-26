'use client';

import { useState } from 'react';
import { AlertTriangle, CalendarClock, MessageSquarePlus, PhoneCall, Pencil, Trash2 } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import {
  CONTACT_METHOD_LABEL, PROMISE_STATUS_CONFIG, CollectionNoteRow, PromiseStatus,
  useAlerts, useCollectionNotes, useDeleteCollectionNote, useSetPromiseStatus,
} from '@/hooks/useCollectionsReports';
import { formatDateUTC, formatMoney } from '@/lib/utils';
import { CollectionNoteModal } from './CollectionNoteModal';
import { ConfirmModal, ErrorLine, Pill, btnPrimary, btnSmall, btnSmallDanger, inputCls } from './ui';

const DIRECTION = ['CAE', 'ADMIN', 'SUPER_ADMIN'];

/** Alertas de cobro (derivadas, sin tareas programadas) en tarjetas que llevan al contacto o a la factura. */
export function AlertsBar({ onOpenInvoice, onNoteFor }: { onOpenInvoice: (id: string) => void; onNoteFor: (clientId: string, invoiceId?: string) => void }) {
  const { data, error } = useAlerts();
  if (error) return <ErrorLine error={error} />;
  if (!data) return null;
  const { counts } = data;
  if (counts.overduePromises + counts.followUps + counts.unattendedInvoices === 0) {
    return <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">Sin alertas de cobro: no hay promesas vencidas, seguimientos pendientes ni facturas vencidas sin gestión.</p>;
  }
  return (
    <div className="grid md:grid-cols-3 gap-3">
      <AlertCard icon={<AlertTriangle className="w-4 h-4 text-red-600" />} title="Promesas vencidas" count={counts.overduePromises} tone="red">
        {data.overduePromises.slice(0, 5).map((n) => (
          <li key={n.id} className="flex justify-between gap-2">
            <span className="truncate">{n.client?.legalName} — prometió el {formatDateUTC(n.promiseDate!)}{n.promiseAmount ? ` (${formatMoney(n.promiseAmount)})` : ''}</span>
            <button type="button" className="text-blue-600 hover:underline shrink-0" onClick={() => onNoteFor(n.clientId, n.invoiceId ?? undefined)}>Anotar</button>
          </li>
        ))}
      </AlertCard>
      <AlertCard icon={<CalendarClock className="w-4 h-4 text-amber-600" />} title="Seguimientos de hoy o atrasados" count={counts.followUps} tone="amber">
        {data.followUps.slice(0, 5).map((n) => (
          <li key={n.id} className="flex justify-between gap-2">
            <span className="truncate">{n.client?.legalName} — {formatDateUTC(n.nextFollowUpOn!)}</span>
            <button type="button" className="text-blue-600 hover:underline shrink-0" onClick={() => onNoteFor(n.clientId, n.invoiceId ?? undefined)}>Anotar</button>
          </li>
        ))}
      </AlertCard>
      <AlertCard icon={<PhoneCall className="w-4 h-4 text-orange-600" />} title={`Vencidas sin gestión en ${data.staleDays} días`} count={counts.unattendedInvoices} tone="orange">
        {data.unattendedInvoices.slice(0, 5).map((i) => (
          <li key={i.id} className="flex justify-between gap-2">
            <button type="button" className="text-left truncate text-blue-600 hover:underline" onClick={() => onOpenInvoice(i.id)}>{i.client?.legalName} · {i.invoiceNumber}</button>
            <span className="shrink-0">{i.overdueDays} d · {formatMoney(i.balance)}</span>
          </li>
        ))}
      </AlertCard>
    </div>
  );
}

function AlertCard({ icon, title, count, tone, children }: { icon: React.ReactNode; title: string; count: number; tone: 'red' | 'amber' | 'orange'; children: React.ReactNode }) {
  const ring = tone === 'red' ? 'border-red-200' : tone === 'amber' ? 'border-amber-200' : 'border-orange-200';
  return (
    <div className={`rounded-xl border bg-white p-3 ${count > 0 ? ring : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">{icon}{title}<span className="ml-auto text-lg">{count}</span></div>
      {count > 0 && <ul className="mt-2 space-y-1 text-xs text-gray-600">{children}</ul>}
    </div>
  );
}

/** Pestaña «Gestión de cobro»: línea de tiempo de contactos y promesas, con alta, corrección, estado de la promesa y borrado. */
export function ManagementPanel({ clientId, onOpenInvoice }: { clientId: string; onOpenInvoice: (id: string) => void }) {
  const { user, hasRole } = useUser();
  const canDirect = hasRole(DIRECTION);
  const [page, setPage] = useState(1);
  const [promiseFilter, setPromiseFilter] = useState<PromiseStatus | ''>('');
  const notes = useCollectionNotes({ clientId: clientId || undefined, promiseStatus: promiseFilter || undefined, page, pageSize: 50 });
  const [editing, setEditing] = useState<CollectionNoteRow | null>(null);
  const [creating, setCreating] = useState<{ clientId?: string; invoiceId?: string } | null>(null);
  const [deleting, setDeleting] = useState<CollectionNoteRow | null>(null);
  const setStatus = useSetPromiseStatus();
  const remove = useDeleteCollectionNote();
  const canEdit = (n: CollectionNoteRow) => canDirect || n.createdById === user?.id;

  return (
    <section className="space-y-4">
      <AlertsBar onOpenInvoice={onOpenInvoice} onNoteFor={(c, i) => setCreating({ clientId: c, invoiceId: i })} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!clientId} onClick={() => setCreating({ clientId })} className={btnPrimary} title={clientId ? undefined : 'Elige un cliente arriba para anotar un contacto'}>
          <MessageSquarePlus className="inline w-4 h-4 mr-1" />Anotar contacto
        </button>
        <select value={promiseFilter} onChange={(e) => { setPromiseFilter(e.target.value as PromiseStatus | ''); setPage(1); }} className={`${inputCls} w-52`}>
          <option value="">Todas las notas</option>
          {(Object.keys(PROMISE_STATUS_CONFIG) as PromiseStatus[]).map((k) => <option key={k} value={k}>Promesa {PROMISE_STATUS_CONFIG[k].label.toLowerCase()}</option>)}
        </select>
        {!clientId && <span className="text-xs text-gray-500">Se muestran las notas de todos los clientes. Elige un cliente para anotar un contacto nuevo.</span>}
      </div>
      <ErrorLine error={notes.error ?? setStatus.error ?? remove.error} />
      {notes.isLoading && <p className="text-sm text-gray-400">Cargando…</p>}
      {notes.data?.items.length === 0 && <p className="text-sm text-gray-400">Todavía no hay contactos anotados.</p>}
      <ol className="space-y-3">
        {notes.data?.items.map((n) => {
          const ps = n.promiseStatus ? PROMISE_STATUS_CONFIG[n.promiseStatus] : null;
          return (
            <li key={n.id} className="rounded-xl border border-gray-200 bg-white p-3 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <strong className="text-gray-700">{formatDateUTC(n.contactedOn)}</strong>
                <span>{CONTACT_METHOD_LABEL[n.method]}{n.contactName ? ` con ${n.contactName}` : ''}</span>
                {!clientId && n.client && <span className="font-medium text-gray-600">· {n.client.legalName}</span>}
                {n.invoiceId && <button type="button" onClick={() => onOpenInvoice(n.invoiceId!)} className="text-blue-600 hover:underline">Factura {n.invoiceNumber}</button>}
                <span className="ml-auto">por {n.createdByName ?? '—'}</span>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.note}</p>
              {n.promiseDate && ps && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Pill label={`Promesa ${ps.label.toLowerCase()}`} bg={ps.bg} color={ps.color} />
                  <span className="text-gray-600">para el {formatDateUTC(n.promiseDate)}{n.promiseAmount ? ` por ${formatMoney(n.promiseAmount)}` : ''}</span>
                  {n.promiseOverdue && <Pill label="Vencida" bg="bg-red-50" color="text-red-700" />}
                  {n.possiblyKept && <Pill label="Posible cumplida: hay cobros posteriores que la cubren" bg="bg-emerald-50" color="text-emerald-700" />}
                  <select aria-label="Estado de la promesa" value={n.promiseStatus!} disabled={setStatus.isPending}
                    onChange={(e) => setStatus.mutate({ id: n.id, status: e.target.value as PromiseStatus })} className="rounded-md border border-gray-200 px-1.5 py-0.5 text-xs">
                    {(Object.keys(PROMISE_STATUS_CONFIG) as PromiseStatus[]).map((k) => <option key={k} value={k}>{PROMISE_STATUS_CONFIG[k].label}</option>)}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {n.nextFollowUpOn && <span>Volver a contactar el <strong>{formatDateUTC(n.nextFollowUpOn)}</strong></span>}
                {canEdit(n) && (
                  <span className="ml-auto space-x-1">
                    <button type="button" onClick={() => setEditing(n)} className={`${btnSmall} inline-flex items-center gap-1`}><Pencil className="w-3 h-3" /> Corregir</button>
                    <button type="button" onClick={() => setDeleting(n)} className={`${btnSmallDanger} inline-flex items-center gap-1`}><Trash2 className="w-3 h-3" /> Borrar</button>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {(notes.data?.total ?? 0) > 50 && (
        <div className="flex justify-end gap-2 text-xs text-gray-500">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={btnSmall}>Anterior</button>
          <span>Página {page} de {Math.ceil((notes.data?.total ?? 0) / 50)}</span>
          <button type="button" disabled={page * 50 >= (notes.data?.total ?? 0)} onClick={() => setPage(page + 1)} className={btnSmall}>Siguiente</button>
        </div>
      )}

      {creating?.clientId && <CollectionNoteModal clientId={creating.clientId} invoiceId={creating.invoiceId} onClose={() => setCreating(null)} />}
      {editing && <CollectionNoteModal note={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmModal
          title="Borrar nota de gestión" confirmLabel="Borrar nota" pending={remove.isPending} error={remove.error}
          description="La nota se borra de la línea de tiempo; su contenido queda en la bitácora de la cobranza."
          onClose={() => setDeleting(null)}
          onConfirm={async () => { try { await remove.mutateAsync(deleting.id); setDeleting(null); } catch { /* abajo */ } }}
        />
      )}
    </section>
  );
}
