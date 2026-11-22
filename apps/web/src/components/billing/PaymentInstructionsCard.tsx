'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Save } from 'lucide-react';
import { BTN_PRIMARY, Callout, Card, Field, INPUT_CLS } from '@/components/billing/ui';
import { useBillingSettings, useUpdateBillingSettings } from '@/hooks/useBillingAdmin';
import {
  INSTRUCTIONS_MAX, INSTRUCTION_METHODS, buildInstructionsBody, errorText, instructionsChanged, instructionsToForm, type InstructionsForm,
} from '@/lib/billing/payments';

/**
 * «Cómo pagar» por método (QR, transferencia, efectivo): el texto que el cliente ve al generar su referencia de pago.
 * Se guarda en los parámetros de la plataforma (PATCH /billing-admin/settings → paymentInstructions) y se pide solo si se abre el panel.
 */
export function PaymentInstructionsCard({ notify }: { notify: (kind: 'ok' | 'warn', msg: string) => void }) {
  const q = useBillingSettings();
  const update = useUpdateBillingSettings();
  const saved = useMemo(() => instructionsToForm(q.data?.paymentInstructions), [q.data]);
  const [form, setForm] = useState<InstructionsForm | null>(null);
  const [open, setOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.data && !form) setForm(saved);
  }, [q.data, form, saved]);

  const loaded = INSTRUCTION_METHODS.filter((m) => saved[m.key].trim() !== '').map((m) => m.label);
  const check = form ? buildInstructionsBody(form, q.data?.paymentInstructions) : null;
  const changed = form ? instructionsChanged(form, saved) : false;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (!check || !check.ok || !changed) return;
    setError(null);
    try {
      await update.mutateAsync({ paymentInstructions: check.body.paymentInstructions });
      setShowErrors(false);
      notify('ok', 'Se guardaron los datos de pago que verán los clientes.');
    } catch (err) {
      setError(errorText(err, 'No se pudieron guardar los datos de pago.'));
    }
  }

  return (
    <Card
      title="Datos de pago que ve el cliente"
      subtitle={
        q.isError ? 'No se pudieron leer los parámetros en este momento.'
          : q.isLoading ? 'Leyendo…'
            : loaded.length > 0 ? `Cargados: ${loaded.join(', ')}.`
              : 'Todavía no cargaste datos de pago: los clientes verán un aviso para escribirte con su referencia.'
      }
      action={
        <button
          type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="pi-panel" disabled={q.isLoading || q.isError}
          className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2D4A] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
          {open ? 'Ocultar' : 'Ver y editar'}
        </button>
      }
    >
      {open && form && (
        <form id="pi-panel" onSubmit={save} className="space-y-4" noValidate>
          <p className="text-sm leading-relaxed text-gray-700">
            Escribe, para cada método, lo que el cliente necesita para pagar (banco, cuenta, titular, a qué correo enviar el comprobante). Se muestra tal cual,
            sin formato, junto a su referencia. Un método vacío no muestra datos.
          </p>
          {INSTRUCTION_METHODS.map((m) => {
            const err = showErrors && check && !check.ok ? check.errors[m.key] : undefined;
            return (
              <Field key={m.key} label={m.label} htmlFor={`pi-${m.key}`} help={`Hasta ${INSTRUCTIONS_MAX.toLocaleString('en-US')} caracteres. (${form[m.key].trim().length})`} error={err}>
                <textarea
                  id={`pi-${m.key}`} rows={3} value={form[m.key]} placeholder={m.placeholder} aria-invalid={!!err}
                  onChange={(e) => setForm((f) => (f ? { ...f, [m.key]: e.target.value } : f))} className={INPUT_CLS}
                />
              </Field>
            );
          })}
          {error && <Callout tone="critical">{error}</Callout>}
          <div className="flex justify-end">
            <button type="submit" disabled={!changed || update.isPending} className={BTN_PRIMARY}>
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {update.isPending ? 'Guardando…' : 'Guardar datos de pago'}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
