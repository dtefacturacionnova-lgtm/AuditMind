'use client';

import type { WorkingPaper } from '@/hooks/useWorkingPapers';
import { Building2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';

function toInitials(name?: string | null): string {
  if (!name) return '—';
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('')
    .slice(0, 3);
}

function FieldRow({
  label,
  value,
  accent,
  auto,
  small,
}: {
  label: string;
  value: string;
  accent?: boolean;
  auto?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1 px-3 py-1.5">
      <span className="text-[7.5px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap min-w-[70px]">
        {label}
      </span>
      <span
        className={[
          'flex-1 leading-tight break-words',
          accent ? 'text-[11px] font-bold text-[#1A2B4A]' : 'text-[10px] text-gray-700',
          small ? 'text-[9px]' : '',
          auto ? 'italic text-gray-500' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

function SigRow({
  label,
  initials,
  date,
  auto,
}: {
  label: string;
  initials: string;
  date?: string | null;
  auto?: boolean;
}) {
  return (
    <div className="border-t border-gray-100">
      <div className="px-2 py-0.5 bg-gray-50">
        <p className="text-[7px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
      </div>
      <div className="grid grid-cols-2">
        <div className="border-r border-gray-100 flex items-center justify-center py-1.5 bg-white">
          <span
            className={[
              'font-mono text-xs font-black',
              auto ? 'text-[#2E5090]' : 'text-gray-300',
            ].join(' ')}
          >
            {initials}
          </span>
        </div>
        <div className="flex items-center justify-center py-1.5 bg-white">
          <span className="text-[8px] text-gray-500 font-mono">
            {date ? formatDate(date) : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function PaperHeader({ wp }: { wp: WorkingPaper }) {
  const org = wp.audit?.organization;
  const entity = wp.audit?.auditEntity;
  const clientName = entity?.name ?? wp.audit?.title ?? '—';

  const periodStart = wp.audit?.auditPeriodStart ?? (wp as any).periodStart;
  const periodEnd = wp.audit?.auditPeriodEnd ?? (wp as any).periodEnd;
  const periodStr =
    periodStart
      ? `${formatDate(periodStart)} → ${formatDate(periodEnd ?? periodStart)}`
      : '—';

  const ref = (wp as any).ref ?? wp.paperCode ?? (wp as any).code ?? '—';

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm print:shadow-none">
      <div
        className="grid"
        style={{ gridTemplateColumns: '110px 1fr 180px' }}
      >
        {/* Col A: Firma / Logo */}
        <div className="border-r border-gray-200 flex flex-col items-center justify-start p-2.5 gap-1.5">
          {org?.logoUrl ? (
            <img
              src={org.logoUrl}
              alt={org.name}
              className="w-8 h-8 rounded object-contain"
            />
          ) : (
            <div className="w-8 h-8 rounded bg-[#2E5090] flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4 h-4 text-white" />
            </div>
          )}
          <p className="text-[8px] font-bold text-center text-[#1A2B4A] uppercase leading-tight tracking-wide">
            {org?.name ?? 'AuditMind'}
          </p>
        </div>

        {/* Col B: Datos del encargo */}
        <div className="border-r border-gray-200 divide-y divide-gray-100">
          <FieldRow label="Cliente" value={clientName} accent />
          <FieldRow label="Auditoría" value={wp.audit?.title ?? '—'} />
          <FieldRow label="Periodo evaluado" value={periodStr} auto />
          <FieldRow label="Alcance" value={wp.audit?.scope ?? '—'} small />
        </div>

        {/* Col C: Ref + Firmas */}
        <div className="flex flex-col">
          <div className="bg-[#2E5090] text-white text-center py-2.5">
            <p className="text-[7.5px] uppercase tracking-widest opacity-70 mb-0.5">
              Ref. Archivo
            </p>
            <p className="font-mono font-black text-xl leading-none">{ref}</p>
          </div>

          <div className="grid grid-cols-2 border-t border-[#3a63a8]">
            <div className="border-r border-gray-100 px-2 py-1 bg-blue-50">
              <p className="text-[7px] font-bold uppercase tracking-widest text-gray-400 text-center">
                Firma
              </p>
            </div>
            <div className="px-2 py-1 bg-blue-50">
              <p className="text-[7px] font-bold uppercase tracking-widest text-gray-400 text-center">
                Fecha
              </p>
            </div>
          </div>

          <SigRow
            label="Preparado"
            initials={toInitials(wp.preparedBy?.name)}
            date={wp.preparedAt ?? wp.createdAt}
            auto={!!wp.preparedBy}
          />
          <SigRow
            label="Revisado"
            initials={toInitials(wp.reviewedBy?.name)}
            date={wp.reviewedAt}
            auto={!!wp.reviewedBy}
          />
        </div>
      </div>

      {/* Barra de título */}
      <div className="bg-[#1A2B4A] text-white text-center py-2 px-4">
        <p className="text-xs font-black uppercase tracking-[0.14em]">{wp.title}</p>
      </div>
    </div>
  );
}
