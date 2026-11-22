'use client';

import { useId, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useCreatePack, useUpdatePack } from '@/hooks/useBillingAdmin';
import type { AdminPackRow } from '@/lib/billing/admin-types';
import {
  LOW_MARGIN_PCT, PACK_COST_BASIS, PACK_KINDS, PACK_KIND_LABEL, PACK_NAME_MAX, PACK_UNIT, buildCreateBody, buildUpdateBody, emptyPackForm, nextSortOrder, packEconomics, packPreview,
  packToForm, packWarnings, parsePackPrice, parseQuantity, quantityLockText, suggestPackCode, suggestPackName, validatePackForm, type PackErrors, type PackFormState,
} from '@/lib/billing/pack-catalog';
import { errorText } from '@/lib/billing/payments';
import { usd } from '@/lib/billing/pricing';
import type { PackKind } from '@/lib/billing/packs';
import { BTN_PRIMARY, BTN_SECONDARY, Callout, CheckRow, Field, INPUT_CLS, Modal, Pill } from './ui';

interface Props {
  /** Paquete que se edita; null = paquete nuevo. */
  pack: AdminPackRow | null;
  /** Todo el catálogo (para sugerir el orden, detectar códigos repetidos y avisar de duplicados). */
  packs: readonly AdminPackRow[];
  /** Pagos pendientes de este paquete: mientras haya alguno, la cantidad no se puede cambiar. */
  pending: number;
  costPerRequestUsd: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/**
 * Crear o editar un paquete del catálogo. Muestra cómo lo verá el cliente, el costo estimado y el margen (solo superadmin) y las advertencias
 * (precio por debajo del costo, cantidad repetida, único paquete de su tipo). El código y el tipo no se pueden cambiar después de crearlo.
 */
export function PackEditorModal({ pack, packs, pending, costPerRequestUsd, onClose, onSaved }: Props) {
  const isNew = pack === null;
  const uid = useId();
  const create = useCreatePack();
  const update = useUpdatePack();

  const [form, setForm] = useState<PackFormState>(() => (pack ? packToForm(pack) : emptyPackForm('AI', nextSortOrder(packs))));
  const [baseline] = useState(() => JSON.stringify(form));
  // Mientras el código y el nombre no se escriban a mano, siguen a la cantidad y al tipo (+1,000 peticiones de IA → AI_1000).
  const [codeTouched, setCodeTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const quantityLocked = !isNew && pending > 0;
  const saving = create.isPending || update.isPending;
  const dirty = JSON.stringify(form) !== baseline;
  const existingCodes = useMemo(() => packs.map((p) => p.code), [packs]);
  const errors: PackErrors = useMemo(() => validatePackForm(form, isNew ? 'create' : 'update', existingCodes), [form, isNew, existingCodes]);
  const quantity = parseQuantity(form.quantity);
  const price = parsePackPrice(form.price);
  const economics = useMemo(() => packEconomics(form.kind, quantity, price, costPerRequestUsd), [form.kind, quantity, price, costPerRequestUsd]);
  const preview = useMemo(() => packPreview(form), [form]);
  const warnings = useMemo(
    () => packWarnings({ form, quantity, price, economics, others: packs.filter((p) => p.id !== pack?.id) }),
    [form, quantity, price, economics, packs, pack?.id],
  );
  const err = (k: keyof PackErrors) => (showErrors ? errors[k] : undefined);

  function patch(next: Partial<PackFormState>) {
    setForm((f) => {
      const merged = { ...f, ...next };
      if (isNew) {
        const q = parseQuantity(merged.quantity);
        if (!codeTouched) merged.code = suggestPackCode(merged.kind, q);
        if (!nameTouched) merged.name = suggestPackName(merged.kind, q);
      }
      return merged;
    });
  }

  async function save() {
    setShowErrors(true);
    setFailure(null);
    if (Object.keys(errors).length > 0) return;
    try {
      if (isNew) {
        const body = buildCreateBody(form, existingCodes);
        if (!body) return;
        await create.mutateAsync(body);
        onSaved(`Paquete ${body.code} creado${body.active ? '' : ' (inactivo: los clientes todavía no lo ven)'}.`);
      } else {
        const body = buildUpdateBody(form, pack, { quantityLocked });
        if (!body) { onClose(); return; }
        await update.mutateAsync({ id: pack.id, body });
        onSaved(`Paquete ${pack.code} guardado. No cambia lo que ya compraron los clientes ni los pagos ya pedidos.`);
      }
      onClose();
    } catch (e) {
      setFailure(errorText(e, 'No se pudo guardar el paquete. Intenta de nuevo.'));
    }
  }

  const id = (name: string) => `${uid}-${name}`;
  const kind = form.kind;
  const unit = PACK_UNIT[kind];

  return (
    <Modal
      size="lg"
      title={isNew ? 'Nuevo paquete' : `Editar ${pack.name}`}
      subtitle={isNew
        ? 'Lo que el cliente puede comprar cuando se le acaban las peticiones de IA o el espacio.'
        : `Código ${pack.code} · ${PACK_KIND_LABEL[pack.kind]}. El código y el tipo no se pueden cambiar.`}
      onClose={onClose}
    >
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate className="grid gap-4 sm:grid-cols-2">
        {isNew && (
          <>
            <Field label="Tipo" htmlFor={id('kind')} help="La IA se paga una vez; el espacio, cada mes." className="sm:col-span-1">
              <select
                id={id('kind')} value={form.kind} onChange={(e) => patch({ kind: e.target.value as PackKind })}
                className={INPUT_CLS}
              >
                {PACK_KINDS.map((k) => <option key={k} value={k}>{PACK_KIND_LABEL[k]}</option>)}
              </select>
            </Field>
            <Field label="Código" htmlFor={id('code')} error={err('code')} help="Letras, números y guion bajo. No se puede cambiar después." className="sm:col-span-1">
              <input
                id={id('code')} type="text" value={form.code} maxLength={40} autoComplete="off" spellCheck={false}
                aria-invalid={!!err('code')} aria-describedby={err('code') ? `${id('code')}-error` : `${id('code')}-help`}
                onChange={(e) => { setCodeTouched(true); setForm((f) => ({ ...f, code: e.target.value.toUpperCase() })); }}
                className={`${INPUT_CLS} font-mono`}
              />
            </Field>
          </>
        )}

        <Field label="Nombre" htmlFor={id('name')} error={err('name')} help="Lo que ve el cliente en «Comprar más»." className="sm:col-span-2">
          <input
            id={id('name')} type="text" value={form.name} maxLength={PACK_NAME_MAX + 20} autoComplete="off"
            aria-invalid={!!err('name')} aria-describedby={err('name') ? `${id('name')}-error` : `${id('name')}-help`}
            onChange={(e) => { setNameTouched(true); setForm((f) => ({ ...f, name: e.target.value })); }}
            className={INPUT_CLS}
          />
        </Field>

        <Field
          label={`Cantidad (${unit})`} htmlFor={id('quantity')} error={err('quantity')}
          help={quantityLocked ? undefined : kind === 'AI' ? 'Peticiones de IA que suma al comprarlo. Se gastan después de las del plan y valen 12 meses.' : 'GB que suma mientras dure la licencia vigente.'}
        >
          <input
            id={id('quantity')} type="text" inputMode="numeric" value={form.quantity} disabled={quantityLocked} autoComplete="off"
            aria-invalid={!!err('quantity')} aria-describedby={err('quantity') ? `${id('quantity')}-error` : quantityLocked ? `${id('quantity')}-lock` : `${id('quantity')}-help`}
            onChange={(e) => patch({ quantity: e.target.value })}
            className={`${INPUT_CLS} tabular-nums`}
          />
          {quantityLocked && <p id={`${id('quantity')}-lock`} className="text-xs leading-relaxed text-amber-900">{quantityLockText(pending)}</p>}
        </Field>

        <Field
          label={kind === 'AI' ? 'Precio (USD, pago único)' : 'Precio (USD por mes)'} htmlFor={id('price')} error={err('price')}
          help={kind === 'AI' ? 'Lo que paga el cliente por todo el paquete.' : 'El cliente paga este precio × los meses que le falten a su licencia.'}
        >
          <input
            id={id('price')} type="text" inputMode="decimal" value={form.price} autoComplete="off" placeholder="0.00"
            aria-invalid={!!err('price')} aria-describedby={err('price') ? `${id('price')}-error` : `${id('price')}-help`}
            onChange={(e) => patch({ price: e.target.value })}
            className={`${INPUT_CLS} tabular-nums`}
          />
        </Field>

        <Field label="Orden" htmlFor={id('sort')} error={err('sortOrder')} help="Los más chicos salen primero. Déjalo de 10 en 10 para poder intercalar.">
          <input
            id={id('sort')} type="text" inputMode="numeric" value={form.sortOrder} autoComplete="off"
            aria-invalid={!!err('sortOrder')} aria-describedby={err('sortOrder') ? `${id('sort')}-error` : `${id('sort')}-help`}
            onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
            className={`${INPUT_CLS} tabular-nums`}
          />
        </Field>

        <div className="sm:col-span-1 sm:self-end">
          <CheckRow
            id={id('active')} checked={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))}
            label="Activo"
            description="Si lo apagas, los clientes ya no lo ven para comprar. Lo ya comprado no cambia."
          />
        </div>

        {/* Cómo lo ve el cliente + costo y margen (solo superadmin) */}
        <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:col-span-2 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Así lo ve el cliente</p>
            {preview ? (
              <div className="mt-1.5">
                <p className="text-sm font-bold text-gray-900">{preview.title}</p>
                <p className="text-xs text-gray-600">{preview.name}</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">
                  {preview.priceText} <span className="text-xs font-medium text-gray-600">{preview.cadence}</span>
                </p>
                <p className="text-xs tabular-nums text-gray-600">{preview.unitText}</p>
              </div>
            ) : (
              <p className="mt-1.5 text-sm text-gray-600">Escribe una cantidad y un precio válidos para ver la vista previa.</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Costo y margen (solo tú lo ves)</p>
            {economics.cost !== null ? (
              <div className="mt-1.5 space-y-1 text-sm">
                <p className="tabular-nums text-gray-800">
                  Costo estimado: <strong>{usd(economics.cost)}</strong>
                </p>
                <p className="text-xs leading-relaxed text-gray-600">{PACK_COST_BASIS[kind]}</p>
                {economics.margin ? (
                  <p>
                    <Pill tone={economics.margin.amount < 0 ? 'red' : economics.margin.pct < LOW_MARGIN_PCT ? 'amber' : 'green'}>
                      Margen {economics.margin.pct} % · {usd(economics.margin.amount)}
                    </Pill>
                  </p>
                ) : (
                  <p className="text-xs text-gray-600">Con precio $0 no hay margen que calcular.</p>
                )}
              </div>
            ) : (
              <p className="mt-1.5 text-sm text-gray-600">Escribe una cantidad válida para estimar el costo.</p>
            )}
          </div>
        </div>

        {warnings.length > 0 && (
          <Callout tone="warning" title="Revisa antes de guardar" className="sm:col-span-2">
            <ul className="list-disc space-y-0.5 pl-4">
              {warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </Callout>
        )}
        {failure && <Callout tone="critical" title="No se pudo guardar" className="sm:col-span-2">{failure}</Callout>}

        <div className="flex flex-wrap justify-end gap-2 pt-1 sm:col-span-2">
          <button type="button" onClick={onClose} disabled={saving} className={BTN_SECONDARY}>Cancelar</button>
          <button type="submit" disabled={saving || (!isNew && !dirty)} className={BTN_PRIMARY}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {saving ? 'Guardando…' : isNew ? 'Crear paquete' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
