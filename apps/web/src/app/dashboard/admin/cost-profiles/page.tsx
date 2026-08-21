'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DollarSign, Users, ChevronDown, Loader2, ShieldAlert, ArrowRight,
  Info, AlertTriangle, Lock,
} from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { useUser } from '@/hooks/useUser';
import { cn, formatMoney } from '@/lib/utils';
import {
  useCostProfile, useUpsertCostProfile, useOrgUsersList,
} from '@/hooks/useCapacity';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 1 + i);

const DEFAULT_COST_FORM = {
  annualBaseSalary:     0,
  annualBonuses:        0,
  payrollTaxRatePct:    22,
  indirectCostRatePct:  15,
  otherAnnualCosts:     0,
  targetMultiplier:     3.0,
  targetUtilizationPct: 75,
};

// ─── Tarifas de venta (3 niveles) ──────────────────────────────────────────
// % y $ se mantienen sincronizados en vivo contra la Tarifa de Costo del
// último cálculo guardado (profile.effectiveOverrideRate ?? suggestedBillingRate).
// Solo se envía `percent` al guardar — el backend recalcula el monto siempre
// desde el % contra la tarifa de costo vigente (fuente de verdad única).
interface TierFormState { label: string; percent: string; amount: string }

const DEFAULT_TIERS: [TierFormState, TierFormState, TierFormState] = [
  { label: 'Tarifa de Venta 1', percent: '25', amount: '' },
  { label: 'Tarifa de Venta 2', percent: '30', amount: '' },
  { label: 'Tarifa de Venta 3', percent: '40', amount: '' },
];

function fmtNum(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '';
}

function ResultRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between', highlight ? 'py-3' : 'py-2')}>
      <span className={cn('text-sm', highlight ? 'font-semibold text-gray-900' : 'text-gray-600')}>{label}</span>
      <span className={cn('font-mono', highlight ? 'text-lg font-bold text-emerald-700' : 'text-sm text-gray-800')}>
        {value}
      </span>
    </div>
  );
}

export default function CostProfilesPage() {
  const { hasRole } = useUser();
  const canView = hasRole(['ADMIN', 'CAE']);
  const canEdit = hasRole(['ADMIN']);

  const { data: users = [], isLoading: loadingUsers } = useOrgUsersList();
  const [userId, setUserId] = useState('');
  const [year, setYear] = useState(CURRENT_YEAR);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    if (!userId && users.length > 0) setUserId(users[0].id);
  }, [users, userId]);

  const {
    data: profile, isLoading: loadingProfile, isFetching: fetchingProfile, isError,
  } = useCostProfile(userId, year);
  const upsert = useUpsertCostProfile();

  const [form, setForm] = useState<typeof DEFAULT_COST_FORM>(DEFAULT_COST_FORM);
  const [overrideRate, setOverrideRate] = useState('');
  const [tiers, setTiers] = useState<[TierFormState, TierFormState, TierFormState]>(DEFAULT_TIERS);

  // Re-seed el formulario cuando llega el perfil existente (o cambia empleado/año → sin perfil)
  useEffect(() => {
    if (profile) {
      setForm({
        annualBaseSalary:     Number(profile.annualBaseSalary),
        annualBonuses:        Number(profile.annualBonuses),
        payrollTaxRatePct:    profile.payrollTaxRatePct,
        indirectCostRatePct:  profile.indirectCostRatePct,
        otherAnnualCosts:     Number(profile.otherAnnualCosts),
        targetMultiplier:     profile.targetMultiplier,
        targetUtilizationPct: profile.targetUtilizationPct,
      });
      setOverrideRate(profile.effectiveOverrideRate != null ? String(Number(profile.effectiveOverrideRate)) : '');
      // Base para precalcular $ cuando el backend aún no guardó un monto (perfil
      // creado antes de esta función, o % recién default-seeded en el cliente).
      const seedBase = Number(profile.effectiveOverrideRate ?? profile.suggestedBillingRate ?? 0);
      const seedTier = (label: string | null, percent: number | null, amount: number | null, def: TierFormState): TierFormState => {
        const pct = percent ?? Number(def.percent);
        return {
          label: label ?? def.label,
          percent: percent != null ? fmtNum(percent) : def.percent,
          amount: amount != null ? fmtNum(amount) : (seedBase > 0 ? fmtNum(seedBase * (1 + pct / 100)) : ''),
        };
      };
      setTiers([
        seedTier(profile.saleTier1Label, profile.saleTier1Percent, profile.saleTier1Amount, DEFAULT_TIERS[0]),
        seedTier(profile.saleTier2Label, profile.saleTier2Percent, profile.saleTier2Amount, DEFAULT_TIERS[1]),
        seedTier(profile.saleTier3Label, profile.saleTier3Percent, profile.saleTier3Amount, DEFAULT_TIERS[2]),
      ]);
    } else {
      setForm(DEFAULT_COST_FORM);
      setOverrideRate('');
      setTiers(DEFAULT_TIERS);
    }
  }, [profile, userId, year]);

  const selectedUser = users.find(u => u.id === userId);
  const numCls = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] disabled:bg-gray-50 disabled:text-gray-400';

  // Base para calcular las 3 tarifas de venta: la Tarifa de Costo vigente
  // (override si está definida, si no la sugerida). Como en el resto de esta
  // pantalla, refleja el ÚLTIMO cálculo guardado, no ediciones sin guardar.
  const costBaseRate = overrideRate.trim() !== ''
    ? Number(overrideRate)
    : (profile ? Number(profile.suggestedBillingRate) : 0);

  function handleTierPercentChange(idx: 0 | 1 | 2, value: string) {
    setTiers(prev => {
      const next = [...prev] as [TierFormState, TierFormState, TierFormState];
      const pct = Number(value);
      next[idx] = {
        ...next[idx],
        percent: value,
        amount: value !== '' && !isNaN(pct) && costBaseRate > 0 ? fmtNum(costBaseRate * (1 + pct / 100)) : next[idx].amount,
      };
      return next;
    });
  }

  function handleTierAmountChange(idx: 0 | 1 | 2, value: string) {
    setTiers(prev => {
      const next = [...prev] as [TierFormState, TierFormState, TierFormState];
      const amt = Number(value);
      next[idx] = {
        ...next[idx],
        amount: value,
        percent: value !== '' && !isNaN(amt) && costBaseRate > 0 ? fmtNum((amt / costBaseRate - 1) * 100) : next[idx].percent,
      };
      return next;
    });
  }

  // netAvailableHours=0 (sin perfil de Disponibilidad) hace que costRatePerHour salga en 0
  // aunque haya costo anual — es la señal más confiable de que falta configurar disponibilidad.
  const missingAvailability = !!profile
    && Number(profile.totalAnnualCost) > 0
    && Number(profile.costRatePerHour) === 0;

  async function handleSave() {
    if (!userId || !canEdit) return;
    try {
      await upsert.mutateAsync({
        userId,
        year,
        ...form,
        ...(overrideRate.trim() !== '' && { effectiveOverrideRate: Number(overrideRate) }),
        // Solo se envía el %  — el backend siempre recalcula el monto contra la
        // Tarifa de Costo vigente (percent es la fuente de verdad, ver capacity.service.ts).
        saleTier1Label: tiers[0].label, ...(tiers[0].percent.trim() !== '' && { saleTier1Percent: Number(tiers[0].percent) }),
        saleTier2Label: tiers[1].label, ...(tiers[1].percent.trim() !== '' && { saleTier2Percent: Number(tiers[1].percent) }),
        saleTier3Label: tiers[2].label, ...(tiers[2].percent.trim() !== '' && { saleTier3Percent: Number(tiers[2].percent) }),
      });
      setToastMsg('Perfil de costeo guardado correctamente');
    } catch (err) {
      setToastMsg(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setTimeout(() => setToastMsg(''), 3500);
    }
  }

  // ── Permission guard ──
  if (!canView) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Costeo y Tarifas" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="p-4 bg-amber-50 rounded-full">
            <ShieldAlert className="h-10 w-10 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">No tienes permiso para ver esta información</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">
              Necesitas el rol de CAE / Director o Administrador para acceder a esta sección.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Costeo y Tarifas"
        breadcrumbs={[{ label: 'Horas y Rentabilidad' }, { label: 'Costeo y Tarifas' }]}
      />

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-5xl mx-auto w-full">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Costeo y Tarifas de Facturación</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Calcula el costo real de cada auditor y la tarifa de facturación sugerida
            </p>
          </div>
          {!canEdit && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-xs text-gray-500">
              <Lock className="w-3.5 h-3.5" /> Solo lectura — se requiere rol Administrador para editar
            </span>
          )}
        </div>

        {/* Selectors */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-64">
            <label className="block text-xs font-medium text-gray-600 mb-1">Empleado</label>
            <div className="relative">
              <select
                value={userId}
                onChange={e => setUserId(e.target.value)}
                disabled={loadingUsers}
                className="w-full appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A]"
              >
                {loadingUsers && <option>Cargando…</option>}
                {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Año</label>
            <div className="relative">
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] font-medium text-gray-700"
              >
                {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {loadingProfile ? (
          <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form */}
            <div className="bg-white rounded-xl border p-5 space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Estructura de costos anuales
              </p>

              {isError && !profile && (
                <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                  Aún no hay un perfil de costeo guardado para {selectedUser?.name ?? 'este empleado'} en {year}. Completa el formulario para crearlo.
                </p>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Salario base anual *</label>
                <input
                  type="number" min={0} step={0.01} value={form.annualBaseSalary}
                  disabled={!canEdit}
                  onChange={e => setForm(f => ({ ...f, annualBaseSalary: Number(e.target.value) }))}
                  className={numCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Bonos anuales</label>
                <input
                  type="number" min={0} step={0.01} value={form.annualBonuses}
                  disabled={!canEdit}
                  onChange={e => setForm(f => ({ ...f, annualBonuses: Number(e.target.value) }))}
                  className={numCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">% Costos patronales</label>
                  <input
                    type="number" min={0} step={0.1} value={form.payrollTaxRatePct}
                    disabled={!canEdit}
                    onChange={e => setForm(f => ({ ...f, payrollTaxRatePct: Number(e.target.value) }))}
                    className={numCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">% Costos indirectos</label>
                  <input
                    type="number" min={0} step={0.1} value={form.indirectCostRatePct}
                    disabled={!canEdit}
                    onChange={e => setForm(f => ({ ...f, indirectCostRatePct: Number(e.target.value) }))}
                    className={numCls}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Otros costos anuales</label>
                <input
                  type="number" min={0} step={0.01} value={form.otherAnnualCosts}
                  disabled={!canEdit}
                  onChange={e => setForm(f => ({ ...f, otherAnnualCosts: Number(e.target.value) }))}
                  className={numCls}
                />
              </div>

              <div className="border-t pt-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Multiplicador objetivo</label>
                  <input
                    type="number" min={0} step={0.1} value={form.targetMultiplier}
                    disabled={!canEdit}
                    onChange={e => setForm(f => ({ ...f, targetMultiplier: Number(e.target.value) }))}
                    className={numCls}
                  />
                  <p className="mt-1 text-[11px] text-gray-400">Típico 2.5x–3.5x en servicios profesionales</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">% Utilización objetivo</label>
                  <input
                    type="number" min={0} max={100} step={1} value={form.targetUtilizationPct}
                    disabled={!canEdit}
                    onChange={e => setForm(f => ({ ...f, targetUtilizationPct: Number(e.target.value) }))}
                    className={numCls}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Tarifa final aprobada <span className="text-gray-400 font-normal">(opcional — anula la sugerida)</span>
                </label>
                <input
                  type="number" min={0} step={0.01} value={overrideRate}
                  disabled={!canEdit}
                  onChange={e => setOverrideRate(e.target.value)}
                  placeholder="Dejar vacío para usar la tarifa sugerida"
                  className={numCls}
                />
              </div>

              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Tarifas de venta
                </p>
                <p className="text-[11px] text-gray-400 mb-3">
                  Márgenes sobre la Tarifa de Costo ({costBaseRate > 0 ? formatMoney(costBaseRate) : '—'}/hr) para vender la hora de este empleado. Edite % o $ — el otro se calcula solo.
                </p>
                <div className="space-y-2.5">
                  {tiers.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text" value={t.label}
                        disabled={!canEdit}
                        onChange={e => setTiers(prev => {
                          const next = [...prev] as [TierFormState, TierFormState, TierFormState];
                          next[i as 0 | 1 | 2] = { ...next[i as 0 | 1 | 2], label: e.target.value };
                          return next;
                        })}
                        className="flex-1 min-w-0 border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] disabled:bg-gray-50 disabled:text-gray-400"
                      />
                      <div className="relative w-20 shrink-0">
                        <input
                          type="number" step={0.1} value={t.percent}
                          disabled={!canEdit}
                          onChange={e => handleTierPercentChange(i as 0 | 1 | 2, e.target.value)}
                          className="w-full border rounded-lg pl-2.5 pr-5 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] disabled:bg-gray-50 disabled:text-gray-400"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">%</span>
                      </div>
                      <div className="relative w-24 shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">$</span>
                        <input
                          type="number" step={0.01} value={t.amount}
                          disabled={!canEdit}
                          onChange={e => handleTierAmountChange(i as 0 | 1 | 2, e.target.value)}
                          className="w-full border rounded-lg pl-4 pr-2 py-1.5 text-xs text-right font-mono focus:outline-none focus:ring-2 focus:ring-[#0F2D4A]/20 focus:border-[#0F2D4A] disabled:bg-gray-50 disabled:text-gray-400"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {canEdit && (
                <button
                  onClick={handleSave}
                  disabled={!userId || upsert.isPending || form.annualBaseSalary <= 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0F2D4A] text-white text-sm font-medium rounded-lg hover:bg-[#1a3f5f] disabled:opacity-50 transition-colors"
                >
                  {upsert.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {upsert.isPending ? 'Guardando…' : 'Guardar perfil de costeo'}
                </button>
              )}

              {upsert.isError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {(upsert.error as Error)?.message ?? 'Error al guardar'}
                </p>
              )}
            </div>

            {/* Result card — live cascade */}
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Resultado del cálculo
                </p>
                {fetchingProfile && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" />}
              </div>
              <p className="text-xs text-gray-400 mb-3">
                {selectedUser ? selectedUser.name : '—'} · {year}
              </p>

              {profile ? (
                <>
                  <div className="divide-y">
                    <ResultRow label="Costo total anual" value={formatMoney(profile.totalAnnualCost)} />
                    <div className="flex items-center gap-2 py-1 text-gray-300">
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span className="text-[11px] text-gray-400">÷ horas netas disponibles</span>
                    </div>
                    <ResultRow label="Tasa de costo por hora" value={`${formatMoney(profile.costRatePerHour)} / hr`} />
                    <div className="flex items-center gap-2 py-1 text-gray-300">
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span className="text-[11px] text-gray-400">÷ % utilización objetivo</span>
                    </div>
                    <ResultRow label="Tarifa de equilibrio" value={`${formatMoney(profile.breakEvenBillableRate)} / hr`} />
                    <div className="flex items-center gap-2 py-1 text-gray-300">
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span className="text-[11px] text-gray-400">× multiplicador objetivo</span>
                    </div>
                  </div>
                  <div className="mt-2 rounded-xl bg-emerald-50 border border-emerald-100 px-4">
                    <ResultRow
                      label="Tarifa de facturación sugerida"
                      value={`${formatMoney(profile.suggestedBillingRate)} / hr`}
                      highlight
                    />
                  </div>

                  {profile.effectiveOverrideRate != null && (
                    <div className="mt-3 flex items-center justify-between rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                      <span className="text-xs font-medium text-blue-800 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5" /> Tarifa final aprobada
                      </span>
                      <span className="text-sm font-mono font-bold text-blue-800">
                        {formatMoney(profile.effectiveOverrideRate)} / hr
                      </span>
                    </div>
                  )}

                  {(profile.saleTier1Amount != null || profile.saleTier2Amount != null || profile.saleTier3Amount != null) && (
                    <div className="mt-3 rounded-lg border border-gray-100 divide-y">
                      {([
                        [profile.saleTier1Label, profile.saleTier1Percent, profile.saleTier1Amount],
                        [profile.saleTier2Label, profile.saleTier2Percent, profile.saleTier2Amount],
                        [profile.saleTier3Label, profile.saleTier3Percent, profile.saleTier3Amount],
                      ] as const).map(([label, pct, amt], i) => amt != null && (
                        <div key={i} className="flex items-center justify-between px-3 py-2">
                          <span className="text-xs text-gray-600">
                            {label} <span className="text-gray-400">(+{pct}%)</span>
                          </span>
                          <span className="text-sm font-mono font-semibold text-gray-800">
                            {formatMoney(amt)} / hr
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {missingAvailability && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-700 leading-snug">
                        Las horas netas disponibles son 0 porque {selectedUser?.name ?? 'este empleado'} no tiene un perfil de{' '}
                        <Link href="/dashboard/admin/firm-calendar" className="underline font-medium">Disponibilidad</Link> configurado para {year}. Sin horas, la tasa de costo por hora no puede calcularse.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center text-gray-400 gap-2">
                  <DollarSign className="w-8 h-8 opacity-30" />
                  <p className="text-xs max-w-[240px]">
                    {canEdit
                      ? 'Completa y guarda el formulario para ver el cálculo de costeo.'
                      : 'Este empleado aún no tiene un perfil de costeo configurado.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-gray-900 text-white text-sm rounded-xl shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
