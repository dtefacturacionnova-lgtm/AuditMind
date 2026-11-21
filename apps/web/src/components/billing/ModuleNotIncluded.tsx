'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useBilling } from '@/contexts/BillingContext';
import {
  ASSISTANT_INFO, ASSISTANT_KEYS, FUNCTION_INFO, MODULE_INFO, MODULE_KEYS, isFunctionKey, isModuleKey,
  type EntitlementKey,
} from '@/lib/billing/catalog';
import { BTN_PRIMARY, BTN_SECONDARY, Callout, Card, Pill } from './ui';

/**
 * Pantalla «Este módulo no está en tu plan» (maqueta, pantalla 4). Reutilizable: la usan el menú (candado), la guarda de rutas y
 * cualquier pantalla que reciba 403 MODULO_NO_INCLUIDO. No cambia ningún dato: solo informa y lleva a «Mi plan».
 * En modo observación el servidor todavía NO bloquea, así que se ofrece entrar de todos modos.
 */
export function ModuleNotIncluded({ moduleKey }: { moduleKey: EntitlementKey | null }) {
  const { me, planActive, enforcing, isAssistantIncluded } = useBilling();
  const info = moduleKey && isModuleKey(moduleKey) ? MODULE_INFO[moduleKey] : null;
  const fn = moduleKey && isFunctionKey(moduleKey) ? FUNCTION_INFO[moduleKey] : null;
  const title = info?.label ?? fn?.label ?? 'Este módulo';
  const includes = info?.includes ?? (fn ? [fn.description] : []);
  const planName = me?.plan?.name ?? 'actual';
  const includedModules = me ? MODULE_KEYS.filter((k) => me.modules?.includes(k)).map((k) => MODULE_INFO[k].label) : [];
  const observing = planActive && !enforcing;

  return (
    <div className="flex h-full flex-col">
      <Header title="Fuera de tu plan" />
      <div className="mx-auto w-full max-w-5xl flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-6">
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center sm:px-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <Lock className="h-7 w-7 text-blue-800" aria-hidden="true" />
          </div>
          <h1 className="max-w-xl text-balance text-2xl font-bold text-gray-900">
            {info || fn ? `«${title}» no está en tu plan` : 'Este módulo no está en tu plan'}
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-gray-700">
            Tu plan <strong>{planName}</strong>
            {includedModules.length > 0 ? <> incluye {includedModules.join(', ')}.</> : <> no incluye este módulo.</>}
            {' '}Tus datos y tu configuración no cambian: si usaste este módulo antes, vuelve tal como lo dejaste cuando se amplíe el plan.
          </p>

          {includes.length > 0 && (
            <ul className="grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
              {includes.map((t) => (
                <li key={t} className="rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-sm leading-snug text-gray-800">{t}</li>
              ))}
            </ul>
          )}

          <div className="mt-1 flex flex-wrap justify-center gap-3">
            <Link href="/dashboard/billing" className={BTN_PRIMARY}>Ver mi plan</Link>
            <Link href="/dashboard" className={BTN_SECONDARY}>Volver al inicio</Link>
            {observing && info && (
              <Link href={info.entryHref} className={BTN_SECONDARY}>Entrar de todos modos</Link>
            )}
          </div>
          <p className="max-w-xl text-xs text-gray-600">
            Para ampliar tu plan, contacta al administrador de la plataforma.
          </p>
          {observing && (
            <Callout tone="info" className="max-w-xl text-left">
              La plataforma está en <strong>modo observación</strong>: todavía no bloquea este módulo, solo registra qué se bloquearía.
              Puedes entrar de todos modos.
            </Callout>
          )}
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          {me && planActive && (
            <Card title="Asistentes de IA de tu plan" subtitle="Los asistentes que el plan no incluye se ven bloqueados.">
              <ul className="flex flex-wrap gap-2">
                {ASSISTANT_KEYS.map((a) => {
                  const ok = isAssistantIncluded(a);
                  return (
                    <li key={a}>
                      <span
                        title={ASSISTANT_INFO[a]}
                        className={ok
                          ? 'inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-900'
                          : 'inline-flex items-center gap-1 rounded-full border border-dashed border-gray-400 bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700'}
                      >
                        {!ok && <Lock className="h-3 w-3" aria-hidden="true" />}
                        {a}
                        <span className="sr-only">{ok ? ' (incluido)' : ' (no incluido)'}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          <Card title="Después de vencer la licencia">
            <p className="text-sm leading-relaxed text-gray-700">
              No se bloquean módulos: toda la cuenta pasa a <strong>solo lectura</strong> (consultar y exportar) y no se borra nada.
            </p>
            <p className="mt-2"><Pill tone="blue">Nada se borra</Pill></p>
          </Card>
        </div>
      </div>
    </div>
  );
}
