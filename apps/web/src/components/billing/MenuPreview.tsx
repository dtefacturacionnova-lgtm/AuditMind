import {
  Bot, Briefcase, CalendarDays, Handshake, LayoutDashboard, Lock, Settings, ShieldAlert, TrendingUp, Users2, Wallet,
} from 'lucide-react';
import type { ElementType } from 'react';
import { menuPreview } from '@/lib/billing/menu';
import { cn } from '@/lib/utils';

const ICONS: Record<string, ElementType> = {
  'Dashboard': LayoutDashboard, 'Cartera': Handshake, 'Planificación Anual': CalendarDays, 'Ejecución del Plan Anual': Briefcase,
  'Seguimiento': TrendingUp, 'Horas y Rentabilidad': Wallet, 'Riesgos y Controles': ShieldAlert, 'Reportería e IA': Bot,
  'Gobierno': Users2, 'Administración': Settings,
};

/** «Así lo ve el cliente»: el menú con los módulos del plan; los que no están incluidos salen con candado. Es la misma regla del menú real. */
export function MenuPreview({ modules }: { modules: readonly string[] }) {
  const rows = menuPreview(modules);
  return (
    <ul className="flex flex-col gap-0.5 rounded-xl bg-[#0F2D4A] p-3" aria-label="Vista previa del menú del cliente">
      {rows.map((r) => {
        const Icon = ICONS[r.label] ?? LayoutDashboard;
        return (
          <li
            key={r.label}
            className={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2', r.locked ? 'text-slate-400' : 'text-slate-100')}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">{r.label}</span>
              {r.sub && <span className="block text-[11px] opacity-85">{r.sub}</span>}
            </span>
            {r.locked && (
              <>
                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="sr-only">No incluido</span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
