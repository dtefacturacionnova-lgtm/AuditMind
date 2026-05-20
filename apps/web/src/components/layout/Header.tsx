'use client';
import { Bell, Search, Bot, Check, CheckCheck, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import {
  useUnreadCount, useNotifications,
  useMarkNotificationRead, useMarkAllRead,
  getNotificationIcon, getEntityHref,
  AppNotification,
} from '@/hooks/useNotifications';
import { formatRelativeTime } from '@/lib/utils';

interface HeaderProps {
  title?: string;
  breadcrumbs?: { label: string; href?: string }[];
}

// ─── Notification Panel ────────────────────────────────────────────────────────
function NotificationPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { data, isLoading } = useNotifications({ limit: 15 });
  const markRead    = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();

  const handleClick = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    const href = getEntityHref(n.entityType, n.entityId);
    if (href) {
      router.push(href);
      onClose();
    }
  };

  return (
    <div className="absolute right-0 top-10 z-50 w-80 rounded-2xl border border-gray-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-800">Notificaciones</span>
          {(data?.unreadCount ?? 0) > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
              {data!.unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(data?.unreadCount ?? 0) > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
              title="Marcar todas como leídas"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:block">Todas</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data?.items.length ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-400">
            <Bell className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">Sin notificaciones</p>
          </div>
        ) : (
          data.items.map(n => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`w-full text-left flex gap-3 px-4 py-3 transition-colors hover:bg-gray-50 ${
                n.read ? 'opacity-60' : ''
              }`}
            >
              <span className="text-lg shrink-0 mt-0.5">{getNotificationIcon(n.type)}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium text-gray-800 leading-snug truncate ${!n.read ? 'font-semibold' : ''}`}>
                  {n.title}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2 leading-snug">
                  {n.body}
                </p>
                <p className="text-[10px] text-gray-400 mt-1">
                  {formatRelativeTime(n.createdAt)}
                </p>
              </div>
              {!n.read && (
                <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
              )}
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      {(data?.total ?? 0) > 0 && (
        <div className="border-t border-gray-100 px-4 py-2.5 text-center">
          <button
            onClick={() => { router.push('/dashboard/notifications'); onClose(); }}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Ver todas ({data!.total})
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
export function Header({ title, breadcrumbs }: HeaderProps) {
  const { user } = useUser();
  const { data: unread } = useUnreadCount();
  const [notifOpen, setNotifOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Click fuera cierra el panel
  useEffect(() => {
    if (!notifOpen) return;
    function handleOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [notifOpen]);

  return (
    <header className="flex h-14 items-center gap-4 border-b border-gray-200 bg-white px-6 shadow-sm">
      {/* Breadcrumbs / Title */}
      <div className="flex-1 min-w-0">
        {breadcrumbs ? (
          <nav className="flex items-center gap-1 text-sm text-gray-500">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.label} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300">/</span>}
                {crumb.href ? (
                  <a href={crumb.href} className="hover:text-gray-800 transition-colors">
                    {crumb.label}
                  </a>
                ) : (
                  <span className="font-medium text-gray-800">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : (
          <h1 className="truncate text-base font-semibold text-gray-800">{title}</h1>
        )}
      </div>

      {/* Search */}
      <button
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 hover:border-blue-300 hover:bg-blue-50 transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:block">Buscar...</span>
        <kbd className="hidden sm:block rounded bg-gray-200 px-1.5 text-[10px] text-gray-500">⌘K</kbd>
      </button>

      {/* AI Assistant quick launch */}
      <button className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
        <Bot className="h-4 w-4" />
      </button>

      {/* Notifications bell */}
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setNotifOpen(v => !v)}
          className="relative flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <Bell className="h-4 w-4" />
          {(unread?.count ?? 0) > 0 && (
            <span className="absolute right-0 top-0 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {unread!.count > 99 ? '99+' : unread!.count}
            </span>
          )}
        </button>

        {notifOpen && (
          <NotificationPanel onClose={() => setNotifOpen(false)} />
        )}
      </div>

      {/* Avatar */}
      {user && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F2D4A] text-xs font-bold text-white">
          {user.name?.charAt(0).toUpperCase()}
        </div>
      )}
    </header>
  );
}
