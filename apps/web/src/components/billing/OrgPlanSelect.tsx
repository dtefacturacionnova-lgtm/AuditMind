'use client';

import { useId } from 'react';
import { choiceHint, type PlanChoiceGroup } from '@/lib/billing/org-plans';

/**
 * Lista de planes de «Nueva organización» (solo superadmin). Sale del catálogo real de planes: si se agrega o edita un plan, aparece solo.
 * Mientras cargan los planes se muestra desactivada; si no se pudieron leer, se dice con claridad y se crea con el plan por defecto de la plataforma.
 */
export function OrgPlanSelect({
  groups, value, onChange, loading, failed, enforcementMode, className,
}: {
  groups: readonly PlanChoiceGroup[];
  value: string;
  onChange: (code: string) => void;
  loading: boolean;
  failed: boolean;
  enforcementMode?: string | null;
  /** Clases del campo (la pantalla de organizaciones usa las suyas). */
  className?: string;
}) {
  const id = useId();
  const unavailable = failed || (!loading && groups.length === 0);
  const hint = unavailable ? '' : choiceHint(value, groups, enforcementMode);

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-gray-700">Plan</label>
      <select
        id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={loading || unavailable}
        aria-describedby={`${id}-hint`} className={className}
      >
        {loading && <option value="">Cargando planes…</option>}
        {unavailable && <option value="">Plan por defecto de la plataforma</option>}
        {!loading && !unavailable && groups.map((g) => (
          <optgroup key={g.id} label={g.label}>
            {g.choices.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </optgroup>
        ))}
      </select>
      <p id={`${id}-hint`} className={`mt-1 text-[11px] leading-snug ${unavailable ? 'text-amber-700' : 'text-gray-500'}`}>
        {unavailable
          ? 'No se pudieron leer los planes: la organización se creará con el plan por defecto de la plataforma y podrás cambiarlo después en «Planes y suscripciones».'
          : hint}
      </p>
    </div>
  );
}
