'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Piezas de formulario compartidas por las pantallas de cobranza. */
export const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400';
export const labelCls = 'text-xs font-medium text-gray-600';
export const btnPrimary = 'px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60';
export const btnGhost = 'px-3 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-600 hover:bg-gray-50 disabled:opacity-60';
export const btnDanger = 'px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 disabled:opacity-60';
export const btnSmall = 'px-2 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50';
export const btnSmallDanger = 'px-2 py-1 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50';

export const todayIso = () => {
  // Fecha de hoy en El Salvador (UTC−6), igual que el servidor.
  return new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10);
};

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : 'Ocurrió un error inesperado');

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className={`my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-md'} bg-white rounded-2xl shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

export function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{errMsg(error)}</p>;
}

export function Pill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${bg} ${color}`}>{label}</span>;
}

/** Diálogo de confirmación con motivo obligatorio (anular, revertir, quitar). */
export function ReasonModal({ title, description, confirmLabel, pending, error, onConfirm, onClose, minLength = 10 }: {
  title: string; description: string; confirmLabel: string; pending: boolean; error: unknown;
  onConfirm: (reason: string) => void; onClose: () => void; minLength?: number;
}) {
  const [reason, setReason] = useState('');
  const ready = reason.trim().length >= minLength;
  return (
    <Modal title={title} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (ready) onConfirm(reason.trim()); }}>
        <p className="text-sm text-gray-600">{description}</p>
        <Field label={`Motivo * (mínimo ${minLength} caracteres)`}>
          <textarea rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
        </Field>
        <ErrorLine error={error} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`flex-1 ${btnGhost}`}>Cancelar</button>
          <button type="submit" disabled={!ready || pending} className={`flex-1 ${btnDanger}`}>{pending ? 'Procesando…' : confirmLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Confirmación simple (borrar algo sin dinero). */
export function ConfirmModal({ title, description, confirmLabel, pending, error, onConfirm, onClose }: {
  title: string; description: string; confirmLabel: string; pending: boolean; error: unknown; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">{description}</p>
        <ErrorLine error={error} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className={`flex-1 ${btnGhost}`}>Cancelar</button>
          <button type="button" onClick={onConfirm} disabled={pending} className={`flex-1 ${btnDanger}`}>{pending ? 'Procesando…' : confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}

/** Convierte el texto de un campo de monto a número (o undefined si está vacío); el servidor valida los decimales. */
export const toMoney = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v));
