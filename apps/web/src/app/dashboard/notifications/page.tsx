'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Filter } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import {
  useNotifications, useMarkNotificationRead, useMarkAllRead,
  getNotificationIcon, getEntityHref, AppNotification,
} from '@/hooks/useNotifications';
import { formatRelativeTime } from '@/lib/utils';

export default function NotificationsPage() {
  const router = useRouter();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useNotifications({ page, limit: 30, unreadOnly });
  const markRead    = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();

  const handleClick = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    const href = getEntityHref(n.entityType, n.entityId);
    if (href) router.push(href);
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Notificaciones" />

      <div className="flex-1 overflow-auto p-6 max-w-3xl mx-auto w-full space-y-4">

        {/* Actions bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setUnreadOnly(false); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!unreadOnly ? 'bg-[#0F2D4A] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Todas
            </button>
            <button
              onClick={() => { setUnreadOnly(true); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${unreadOnly ? 'bg-[#0F2D4A] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              No leídas {(data?.unreadCount ?? 0) > 0 && `(${data?.unreadCount})`}
            </button>
          </div>

          {(data?.unreadCount ?? 0) > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4" />
              Marcar todas como leídas
            </button>
          )}
        </div>

        {/* List */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !data?.items.length ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Bell className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Sin notificaciones</p>
              <p className="text-xs mt-1">{unreadOnly ? 'Todas leídas — buen trabajo' : 'No hay nada por ahora'}</p>
            </div>
          ) : (
            data.items.map(n => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left flex gap-4 px-5 py-4 transition-colors hover:bg-gray-50 ${n.read ? '' : 'bg-blue-50/40'}`}
              >
                <span className="text-xl shrink-0 mt-0.5">{getNotificationIcon(n.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm leading-snug text-gray-800 ${!n.read ? 'font-semibold' : 'font-medium'}`}>
                      {n.title}
                    </p>
                    <span className="shrink-0 text-xs text-gray-400">{formatRelativeTime(n.createdAt)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{n.body}</p>
                  {n.entityType && (
                    <span className="mt-1.5 inline-block text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      {n.entityType}
                    </span>
                  )}
                </div>
                {!n.read && (
                  <span className="mt-2 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                )}
              </button>
            ))
          )}
        </div>

        {/* Pagination */}
        {(data?.pages ?? 1) > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-500">{page} / {data?.pages}</span>
            <button
              onClick={() => setPage(p => Math.min(data!.pages, p + 1))}
              disabled={page === data?.pages}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
