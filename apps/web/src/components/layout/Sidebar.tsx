'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Globe, CalendarDays, ShieldAlert,
  ClipboardList, Upload, AlertTriangle, BarChart3,
  FileText, LineChart, Bot, Leaf, BadgeCheck, Users2,
  ServerCrash, Settings, ChevronDown, ChevronRight,
  Building2, LogOut, Bell, Plug, BookOpen,
  Briefcase, TrendingUp, FolderOpen, ListTree, Target, Library,
} from 'lucide-react';
import { useState } from 'react';
import { useUser } from '@/hooks/useUser';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href?: string;
  icon: React.ElementType;
  phase?: string;
  children?: NavItem[];
  badge?: string;
  disabled?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  // ── Planificación Anual ───────────────────────────────────────────────────
  {
    label: 'Planificación Anual',
    icon: CalendarDays,
    children: [
      { label: 'Plan Estratégico',          href: '/dashboard/strategic',   icon: Target },
      { label: 'Universo de Auditoría',     href: '/dashboard/universe',    icon: Globe },
      { label: 'Banco de Proyectos',        href: '/dashboard/projects',    icon: ClipboardList },
      { label: 'Plan Anual',                href: '/dashboard/plans',       icon: CalendarDays },
    ],
  },
  // ── Ejecución del Plan Anual ──────────────────────────────────────────────
  // "Ejecución" como grupo global confundía con la fase de ejecución de una
  // auditoría específica. Ahora refleja la ejecución del PLAN ANUAL completo.
  // Los Papeles de Trabajo se gestionan DENTRO de cada Proyecto de Auditoría.
  {
    label: 'Ejecución del Plan Anual',
    icon: Briefcase,
    children: [
      { label: 'Proyectos de Auditoría', href: '/dashboard/audits',         icon: FolderOpen },
      { label: 'Vista Global de Papeles', href: '/dashboard/working-papers', icon: FileText },
    ],
  },
  // ── Seguimiento ───────────────────────────────────────────────────────────
  {
    label: 'Seguimiento',
    icon: TrendingUp,
    children: [
      { label: 'Hallazgos',              href: '/dashboard/findings',      icon: AlertTriangle },
      { label: 'Portal Auditado (PBC)',   href: '/dashboard/pbc',           icon: Upload },
      { label: 'Confirmaciones Ext.',    href: '/dashboard/confirmations', icon: BadgeCheck },
    ],
  },
  {
    label: 'Riesgos y Controles',
    icon: ShieldAlert,
    children: [
      { label: 'Evaluación de Riesgos', href: '/dashboard/risks', icon: ShieldAlert },
    ],
  },
  {
    label: 'Reportería e IA',
    icon: Bot,
    children: [
      { label: 'Motor IA — Agentes', href: '/dashboard/ai', icon: Bot },
      { label: 'Reportes', href: '/dashboard/reports', icon: FileText },
      { label: 'Notificaciones', href: '/dashboard/notifications', icon: Bell },
      { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, phase: 'Fase 2' },
    ],
  },
  {
    label: 'Gobierno',
    icon: Users2,
    children: [
      { label: 'Comité de Auditoría', href: '/dashboard/committee', icon: Users2 },
      { label: 'QAIP y Calidad', href: '/dashboard/qaip', icon: BadgeCheck, phase: 'Fase 5' },
      { label: 'ESG / Sostenibilidad', href: '/dashboard/esg', icon: Leaf, phase: 'Fase 6' },
      { label: 'BCP / DRP', href: '/dashboard/bcp', icon: ServerCrash, phase: 'Fase 5' },
    ],
  },
  {
    label: 'Administración',
    icon: Settings,
    children: [
      { label: 'Organización', href: '/dashboard/admin/organization', icon: Building2 },
      { label: 'Usuarios', href: '/dashboard/admin/users', icon: Users2 },
      { label: 'Catálogos Generales', href: '/dashboard/admin/catalogs', icon: ListTree },
      { label: 'Plantillas de Índice', href: '/dashboard/admin/index-templates', icon: FolderOpen },
      { label: 'Plantillas de Auditoría', href: '/dashboard/admin/audit-templates', icon: ClipboardList },
      { label: 'Biblioteca de Contenido', href: '/dashboard/admin/content-library', icon: Library },
      { label: 'Conectores de Datos', href: '/dashboard/admin/data-sources', icon: Plug },
      { label: 'Base de Conocimiento', href: '/dashboard/admin/knowledge', icon: BookOpen },
      { label: 'Configuración', href: '/dashboard/admin/settings', icon: Settings },
    ],
  },
];

function NavGroup({ item, depth = 0, pathname }: { item: NavItem; depth?: number; pathname: string }) {
  const [open, setOpen] = useState(() => {
    if (!item.children) return false;
    return item.children.some((c) => c.href && pathname.startsWith(c.href));
  });

  if (!item.children && item.href) {
    const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
    return (
      <Link
        href={item.disabled ? '#' : (item.href as string)}
        className={cn(
          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
          depth === 1 && 'ml-4 text-[13px]',
          active
            ? 'bg-[#1a4a7a] text-white font-medium'
            : 'text-slate-300 hover:bg-[#1a4a7a]/60 hover:text-white',
          item.disabled && 'opacity-40 cursor-not-allowed',
        )}
      >
        <item.icon className={cn('shrink-0', depth === 0 ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
        <span className="flex-1 truncate">{item.label}</span>
        {item.phase && (
          <span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">
            {item.phase}
          </span>
        )}
        {item.badge && (
          <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white font-bold">
            {item.badge}
          </span>
        )}
      </Link>
    );
  }

  if (item.children) {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-[#1a4a7a]/60 hover:text-white transition-colors"
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{item.label}</span>
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        {open && (
          <div className="mt-0.5 space-y-0.5">
            {item.children.map((child) => (
              <NavGroup key={child.label} item={child} depth={1} pathname={pathname} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

export function Sidebar() {
  const { user, signOut } = useUser();
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 flex-col overflow-hidden bg-[#0F2D4A] shadow-2xl">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-[#1a4a7a] px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight">AuditMind</p>
          <p className="text-[10px] text-slate-400">Intelligence Platform</p>
        </div>
      </div>

      {/* Organization badge */}
      {user && (
        <div className="mx-3 mt-3 rounded-lg bg-[#1a4a7a]/50 px-3 py-2">
          <p className="truncate text-[11px] font-medium text-blue-300">{user.organizationName ?? 'Mi Organización'}</p>
          <p className="text-[10px] text-slate-400">{user.role?.replace(/_/g, ' ')}</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 scrollbar-thin scrollbar-thumb-slate-600">
        {NAV_ITEMS.map((item) => (
          <NavGroup key={item.label} item={item} pathname={pathname} />
        ))}
      </nav>

      {/* User footer */}
      {user && (
        <div className="border-t border-[#1a4a7a] px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
              {user.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-medium text-white">{user.name}</p>
              <p className="truncate text-[10px] text-slate-400">{user.email}</p>
            </div>
            <button
              onClick={signOut}
              title="Cerrar sesión"
              className="shrink-0 rounded p-1 text-slate-400 hover:text-white hover:bg-[#1a4a7a] transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
