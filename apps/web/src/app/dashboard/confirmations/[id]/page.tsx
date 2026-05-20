'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Send, CheckCircle2, AlertCircle, Clock, Mail, ArrowRight,
  Building2, CreditCard, FileText, AlertTriangle, Lock,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useConfirmation, useSendConfirmation, useReceiveResponse,
  useReconcileConfirmation, useMarkNoResponse, useAltProcedure,
  useDeleteConfirmation,
  CONFIRMATION_STATUS_CONFIG, CONFIRMATION_TYPE_CONFIG, formatAmount,
  ConfirmationStatus,
} from '@/hooks/useConfirmations';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
}

function StatusBadge({ status }: { status: ConfirmationStatus }) {
  const cfg = CONFIRMATION_STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Workflow sections ────────────────────────────────────────────────────────
const WORKFLOW_STEPS: ConfirmationStatus[] = ['DRAFT', 'SENT', 'RECEIVED', 'RECONCILED'];

function WorkflowBar({ status }: { status: ConfirmationStatus }) {
  const special = status === 'NO_RESPONSE' || status === 'ALT_PROCEDURE';
  const currentIdx = WORKFLOW_STEPS.indexOf(status);

  if (special) {
    const cfg = CONFIRMATION_STATUS_CONFIG[status];
    return (
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${cfg.bg} text-sm font-medium ${cfg.color}`}>
        <AlertTriangle className="w-4 h-4" />
        Estado especial: {cfg.label}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {WORKFLOW_STEPS.map((step, i) => {
        const cfg      = CONFIRMATION_STATUS_CONFIG[step];
        const done     = i < currentIdx;
        const active   = i === currentIdx;
        return (
          <React.Fragment key={step}>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              active ? `${cfg.bg} ${cfg.color} ring-1 ring-current` :
              done   ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'
            }`}>
              {done ? <CheckCircle2 className="w-3 h-3" /> : <span className={`w-2 h-2 rounded-full ${active ? cfg.dot : 'bg-gray-300'}`} />}
              {cfg.label}
            </div>
            {i < WORKFLOW_STEPS.length - 1 && (
              <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ConfirmationDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: conf, isLoading } = useConfirmation(params.id);

  const sendConf     = useSendConfirmation();
  const receiveResp  = useReceiveResponse();
  const reconcile    = useReconcileConfirmation();
  const noResponse   = useMarkNoResponse();
  const altProcedure = useAltProcedure();
  const deleteConf   = useDeleteConfirmation();

  // Form state
  const [responseContent,  setRespContent] = useState('');
  const [responseAmount,   setRespAmount]  = useState('');
  const [diffExplanation,  setDiffExp]     = useState('');
  const [altProcText,      setAltProc]     = useState('');

  if (isLoading || !conf) {
    return (
      <div className="flex flex-col h-full">
        <Header breadcrumbs={[
          { label: 'Confirmaciones', href: '/dashboard/confirmations' },
          { label: '...' },
        ]} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const type = CONFIRMATION_TYPE_CONFIG[conf.type];
  const hasDiff = conf.difference != null && Number(conf.difference) > 0;

  const handleSend = () => sendConf.mutateAsync(conf.id);

  const handleReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    await receiveResp.mutateAsync({
      id: conf.id,
      responseContent,
      responseAmount: responseAmount ? +responseAmount : undefined,
    });
    setRespContent('');
    setRespAmount('');
  };

  const handleReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    await reconcile.mutateAsync({ id: conf.id, differenceExplanation: diffExplanation || undefined });
    setDiffExp('');
  };

  const handleNoResponse = () => noResponse.mutateAsync(conf.id);

  const handleAltProcedure = async (e: React.FormEvent) => {
    e.preventDefault();
    await altProcedure.mutateAsync({ id: conf.id, alternativeProcedure: altProcText });
    setAltProc('');
  };

  const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const textareaCls = inputCls + ' resize-none';

  return (
    <div className="flex flex-col h-full">
      <Header breadcrumbs={[
        { label: 'Confirmaciones', href: '/dashboard/confirmations' },
        { label: conf.respondentName },
      ]} />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">

          {/* ── Header card ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">{type.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-500">{type.label}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs text-gray-400">{conf.audit?.title ?? conf.auditId}</span>
                </div>
                <h1 className="text-lg font-bold text-gray-900">{conf.respondentName}</h1>
                <p className="text-sm text-gray-500 mt-0.5">{conf.respondentEmail}</p>
                {conf.accountRef && (
                  <p className="text-xs font-mono text-gray-400 mt-0.5">{conf.accountRef}</p>
                )}
              </div>
              <StatusBadge status={conf.status} />
            </div>

            {/* Workflow bar */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <WorkflowBar status={conf.status} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">

            {/* ── Left: Amounts & dates ── */}
            <div className="col-span-1 space-y-4">

              {/* Montos */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Montos</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Solicitado</span>
                    <span className="font-mono text-sm font-semibold text-gray-800">
                      {formatAmount(conf.amount)}
                    </span>
                  </div>
                  {conf.responseAmount != null && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">Confirmado</span>
                      <span className="font-mono text-sm font-semibold text-gray-800">
                        {formatAmount(conf.responseAmount)}
                      </span>
                    </div>
                  )}
                  {hasDiff && (
                    <div className="flex justify-between items-center pt-1 border-t border-dashed border-red-200">
                      <span className="text-xs text-red-600 font-medium">Diferencia</span>
                      <span className="font-mono text-sm font-bold text-red-600">
                        {formatAmount(Number(conf.difference))}
                      </span>
                    </div>
                  )}
                  {conf.status === 'RECONCILED' && !hasDiff && (
                    <div className="flex items-center gap-1.5 text-emerald-600 text-xs mt-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Sin diferencias
                    </div>
                  )}
                </div>
              </div>

              {/* Fechas */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fechas</p>
                <div className="space-y-2 text-xs">
                  {[
                    { label: 'Creada',          value: formatDate(conf.createdAt) },
                    { label: 'Enviada',          value: formatDate(conf.sentAt) },
                    { label: 'Enviada por',      value: conf.sentBy ?? '—' },
                    { label: 'Respuesta recibida', value: formatDate(conf.responseReceivedAt) },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-gray-500">{label}</span>
                      <span className="text-gray-700 font-medium text-right">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Right: Workflow actions + content ── */}
            <div className="col-span-2 space-y-4">

              {/* Respuesta recibida */}
              {conf.responseContent && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Respuesta del confirmante
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{conf.responseContent}</p>
                  {conf.differenceExplanation && (
                    <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                      <p className="text-xs font-medium text-amber-700 mb-1">Explicación de diferencia:</p>
                      <p className="text-xs text-gray-600">{conf.differenceExplanation}</p>
                    </div>
                  )}
                  {conf.alternativeProcedure && (
                    <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                      <p className="text-xs font-medium text-purple-700 mb-1">Procedimiento alternativo aplicado:</p>
                      <p className="text-xs text-gray-600">{conf.alternativeProcedure}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Action: Send ── */}
              {conf.status === 'DRAFT' && (
                <div className="bg-blue-50 rounded-2xl border border-blue-200 p-4">
                  <div className="flex items-start gap-3">
                    <Send className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-blue-800">Enviar confirmación</p>
                      <p className="text-xs text-blue-600 mt-0.5">
                        Marca la confirmación como enviada al confirmante. Asegúrate de haber enviado
                        la carta de confirmación a <strong>{conf.respondentEmail}</strong>.
                      </p>
                      <button
                        onClick={handleSend}
                        disabled={sendConf.isPending}
                        className="mt-3 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {sendConf.isPending ? 'Enviando...' : 'Marcar como enviada'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Action: Receive response ── */}
              {conf.status === 'SENT' && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                  <p className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-amber-600" />
                    Registrar respuesta recibida
                  </p>
                  <form onSubmit={handleReceive} className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Contenido de la respuesta *</label>
                      <textarea
                        required rows={4} value={responseContent}
                        onChange={e => setRespContent(e.target.value)}
                        placeholder="Transcribe o resume el contenido de la respuesta recibida del confirmante..."
                        className={textareaCls}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">
                        Monto confirmado (CLP) <span className="text-gray-400">(opcional)</span>
                      </label>
                      <input
                        type="number" value={responseAmount}
                        onChange={e => setRespAmount(e.target.value)}
                        placeholder={conf.amount ? String(conf.amount) : 'ej. 1500000'}
                        className={inputCls}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={receiveResp.isPending}
                        className="px-4 py-2 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-60 flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5" />
                        {receiveResp.isPending ? 'Guardando...' : 'Registrar respuesta'}
                      </button>
                      <button type="button" onClick={handleNoResponse} disabled={noResponse.isPending}
                        className="px-4 py-2 border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 disabled:opacity-60">
                        Sin respuesta
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ── Action: Reconcile ── */}
              {conf.status === 'RECEIVED' && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                  <p className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Conciliar confirmación
                  </p>
                  <form onSubmit={handleReconcile} className="space-y-3">
                    {hasDiff && (
                      <div>
                        <label className="text-xs font-medium text-gray-600 block mb-1">
                          Explicación de la diferencia de {formatAmount(Number(conf.difference))} *
                        </label>
                        <textarea
                          rows={3} value={diffExplanation}
                          onChange={e => setDiffExp(e.target.value)}
                          placeholder="Explica la diferencia identificada entre el monto registrado y el confirmado..."
                          className={textareaCls}
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button type="submit" disabled={reconcile.isPending}
                        className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {reconcile.isPending ? 'Conciliando...' : 'Marcar como conciliada'}
                      </button>
                      <button type="button"
                        onClick={() => {/* open alt procedure section */}}
                        className="px-4 py-2 border border-purple-200 text-purple-600 text-xs font-semibold rounded-lg hover:bg-purple-50">
                        Aplicar proc. alternativo
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ── Action: Alt procedure (from NO_RESPONSE or RECEIVED) ── */}
              {(conf.status === 'NO_RESPONSE' || conf.status === 'RECEIVED') && (
                <div className="bg-purple-50 rounded-2xl border border-purple-200 p-4">
                  <p className="text-sm font-semibold text-purple-800 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Procedimiento alternativo (NIA 505.12)
                  </p>
                  <p className="text-xs text-purple-600 mb-3">
                    Cuando no se recibe respuesta, el auditor debe diseñar procedimientos alternativos para
                    obtener evidencia de auditoría relevante.
                  </p>
                  <form onSubmit={handleAltProcedure} className="space-y-3">
                    <textarea
                      required rows={3} value={altProcText}
                      onChange={e => setAltProc(e.target.value)}
                      placeholder="Describe el procedimiento alternativo aplicado (ej: revisión de estados de cuenta posteriores, inspección de documentación de soporte...)"
                      className={textareaCls}
                    />
                    <button type="submit" disabled={altProcedure.isPending}
                      className="px-4 py-2 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-60">
                      {altProcedure.isPending ? 'Guardando...' : 'Registrar procedimiento alternativo'}
                    </button>
                  </form>
                </div>
              )}

              {/* ── Final state ── */}
              {(conf.status === 'RECONCILED' || conf.status === 'ALT_PROCEDURE') && (
                <div className={`rounded-2xl border p-4 flex items-start gap-3 ${
                  conf.status === 'RECONCILED'
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-purple-50 border-purple-200'
                }`}>
                  <Lock className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                    conf.status === 'RECONCILED' ? 'text-emerald-600' : 'text-purple-600'
                  }`} />
                  <div>
                    <p className={`text-sm font-semibold ${
                      conf.status === 'RECONCILED' ? 'text-emerald-800' : 'text-purple-800'
                    }`}>
                      {conf.status === 'RECONCILED' ? 'Confirmación conciliada' : 'Procedimiento alternativo completado'}
                    </p>
                    <p className={`text-xs mt-0.5 ${
                      conf.status === 'RECONCILED' ? 'text-emerald-600' : 'text-purple-600'
                    }`}>
                      Este proceso de confirmación externa ha sido completado.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Delete (only DRAFT) ── */}
              {conf.status === 'DRAFT' && (
                <div className="flex justify-end">
                  <button
                    onClick={async () => {
                      if (confirm('¿Eliminar esta confirmación?')) {
                        await deleteConf.mutateAsync(conf.id);
                        window.history.back();
                      }
                    }}
                    disabled={deleteConf.isPending}
                    className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-60"
                  >
                    Eliminar confirmación
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
