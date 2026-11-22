'use client';

import Link from 'next/link';
import type { UseQueryResult } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Callout, Card, Meter } from '@/components/billing/ui';
import type { BillingLimits } from '@/lib/billing/access';
import type { ClientUsage } from '@/lib/billing/client-types';
import { FILE_TYPE_INFO, type FileTypeKey } from '@/lib/billing/catalog';
import {
  agentBreakdown, aiMeter, barWidth, formatBytes, pctText, storageMeter, typeBreakdown, usageNotices,
} from '@/lib/billing/consumption';
import { cn } from '@/lib/utils';

/** Color de cada tipo de archivo en la barra apilada (la leyenda de abajo repite nombre, tamaño y % para no depender del color). */
const TYPE_COLOR: Record<FileTypeKey, string> = {
  VIDEO: 'bg-blue-700', AUDIO: 'bg-teal-600', PDF: 'bg-indigo-500', FOTO: 'bg-amber-500', PPT: 'bg-rose-500', XLS: 'bg-green-600', OTROS: 'bg-gray-500',
};

export const BUY_AI_HREF = '/dashboard/billing/comprar?tipo=IA';
export const BUY_STORAGE_HREF = '/dashboard/billing/comprar?tipo=ESPACIO';

const BUY_LINK =
  'inline-flex self-start items-center rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900 transition-colors hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2D4A]';

type UsageQuery = Pick<UseQueryResult<ClientUsage>, 'data' | 'isLoading' | 'isError' | 'refetch'>;
type PackLimits = Pick<BillingLimits, 'packsAi' | 'packsStorage'> | null | undefined;

/** ¿Se ofrece el botón «Comprar más» de este tipo? Solo si es ADMIN y el plan admite esos paquetes (`false` explícito = no los admite). */
const canBuyKind = (canBuy: boolean, limits: PackLimits, kind: 'AI' | 'STORAGE'): boolean =>
  canBuy && (kind === 'AI' ? limits?.packsAi : limits?.packsStorage) !== false;

/** Las dos barras de «Uso de tu plan»: peticiones de IA y espacio. Si la lectura falla, un aviso discreto; el resto de la página no cambia. */
export function UsageMeters({ q, canBuy, limits }: { q: UsageQuery; canBuy: boolean; limits?: PackLimits }) {
  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600 sm:col-span-2">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Leyendo tu consumo…
      </div>
    );
  }
  if (q.isError || !q.data || typeof q.data !== 'object') {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-700 sm:col-span-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <span>No se pudo leer tu consumo de IA y de espacio en este momento. Lo demás de tu plan no cambia.</span>
        <button type="button" onClick={() => void q.refetch()} className="font-semibold underline underline-offset-2">Reintentar</button>
      </div>
    );
  }
  const ai = aiMeter(q.data.ai);
  const st = storageMeter(q.data.storage);
  return (
    <>
      <div className="flex flex-col gap-2">
        <Meter label="Peticiones de IA este mes" value={ai.valueText} pct={ai.pct} note={ai.note} />
        {canBuyKind(canBuy, limits, 'AI') && <Link href={BUY_AI_HREF} className={BUY_LINK}>Comprar más peticiones</Link>}
      </div>
      <div className="flex flex-col gap-2">
        <Meter label="Espacio usado" value={st.valueText} pct={st.pct} note={st.note} />
        {canBuyKind(canBuy, limits, 'STORAGE') && <Link href={BUY_STORAGE_HREF} className={BUY_LINK}>Comprar más espacio</Link>}
      </div>
    </>
  );
}

/** Avisos (80 % y 100 %), qué cuenta como 1, 5 o 10 peticiones, espacio por tipo de archivo y peticiones por asistente. */
export function UsageDetails({ q, canBuy, enforcing, limits }: { q: UsageQuery; canBuy: boolean; enforcing: boolean; limits?: PackLimits }) {
  if (q.isLoading || q.isError || !q.data || typeof q.data !== 'object') return null;
  const usage = q.data;
  const notices = usageNotices(usage, enforcing);
  const { slices, totalBytes } = typeBreakdown(usage.storage?.byType);
  const agents = agentBreakdown(usage.ai?.byAgent);
  const shown = slices.filter((s) => s.bytes > 0);
  const maxFile = storageMeter(usage.storage).note;

  return (
    <>
      {notices.map((n) => (
        <Callout key={n.buy} tone={n.level === 'critical' ? 'critical' : 'warning'} title={n.title}>
          <span>{n.text}</span>
          {!canBuy ? <> Si necesitas más, pídeselo a un administrador de tu organización.</> : canBuyKind(canBuy, limits, n.buy) ? (
            <>
              {' '}
              <Link href={n.buy === 'AI' ? BUY_AI_HREF : BUY_STORAGE_HREF} className="font-semibold underline underline-offset-2">
                {n.buy === 'AI' ? 'Comprar más peticiones' : 'Comprar más espacio'}
              </Link>
            </>
          ) : (
            <> Tu plan no admite comprar paquetes de {n.buy === 'AI' ? 'peticiones' : 'espacio'}: pide un cambio de plan a la plataforma.</>
          )}
        </Callout>
      ))}

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Qué ocupa tu espacio" subtitle={maxFile}>
          {totalBytes === 0 ? (
            <p className="text-sm text-gray-700">Todavía no hay archivos guardados en tu organización.</p>
          ) : (
            <div className="space-y-4">
              <div
                role="img" className="flex h-4 gap-0.5 overflow-hidden rounded-full bg-gray-200"
                aria-label={`Espacio por tipo de archivo: ${shown.map((s) => `${FILE_TYPE_INFO[s.key].label} ${pctText(s.share)}`).join(', ')}`}
              >
                {shown.map((s) => (
                  <div key={s.key} className={cn('h-full', TYPE_COLOR[s.key])} style={{ width: `${barWidth(s.share)}%` }} />
                ))}
              </div>
              <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {slices.map((s) => (
                  <li key={s.key} className="flex items-center gap-2 text-sm">
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', TYPE_COLOR[s.key])} aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-gray-800">{FILE_TYPE_INFO[s.key].label}</span>
                    <span className="font-semibold tabular-nums text-gray-900">{formatBytes(s.bytes)}</span>
                    <span className="w-12 text-right tabular-nums text-gray-600">{s.bytes > 0 ? pctText(s.share) : '—'}</span>
                  </li>
                ))}
              </ul>
              {slices[0]?.key === 'VIDEO' && slices[0].share >= 40 && (
                <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-700">
                  Los videos son el {pctText(slices[0].share)} de tu espacio. Puedes descargar y archivar los de auditorías cerradas para liberar espacio.
                </p>
              )}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2" title="Peticiones por asistente este mes">
          {agents.length === 0 ? (
            <p className="text-sm text-gray-700">Todavía no has usado asistentes de IA este mes.</p>
          ) : (
            <ul className="space-y-3">
              {agents.map((a) => (
                <li key={a.agent} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 break-words font-semibold text-gray-900">
                      {a.agent}{a.info && <span className="ml-1.5 text-xs font-normal text-gray-600">{a.info}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-gray-800">{a.requests.toLocaleString('en-US')}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${barWidth(a.barPct)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Qué cuenta como una petición de IA">
        <ul className="grid gap-3 text-sm text-gray-800 sm:grid-cols-3">
          <li className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-lg font-bold tabular-nums text-gray-900">1 petición</p>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-700">Un mensaje a un asistente, mejorar un texto, redactar un hallazgo o sugerir una sección de un papel.</p>
          </li>
          <li className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-lg font-bold tabular-nums text-gray-900">5 peticiones</p>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-700">Analizar un documento largo, un informe o una propuesta completa, o extraer datos de una evidencia.</p>
          </li>
          <li className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-lg font-bold tabular-nums text-gray-900">10 peticiones</p>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-700">Analizar audio o video (por cada 10 minutos) o una investigación forense con varias fuentes.</p>
          </li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-gray-600">
          Las peticiones del plan se reinician cada mes. Las que compras en paquetes se gastan después de las del plan y no se pierden al cambiar de mes.
        </p>
      </Card>
    </>
  );
}
