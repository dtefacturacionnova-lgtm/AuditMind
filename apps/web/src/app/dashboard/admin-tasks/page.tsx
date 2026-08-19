'use client';

import { useState } from 'react';
import {
  Plus, CheckSquare, Clock, Loader2, X, Trash2, AlertCircle, Users2,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useUser } from '@/hooks/useUser';
import { useOrgUsersList } from '@/hooks/useCapacity';
import {
  useAdminTasks, useCreateAdminTask, useUpdateAdminTaskStatus, useDeleteAdminTask,
  BOARD_STATUSES, ADMIN_TASK_STATUS_CONFIG, NEXT_STATUS,
  AdminTask, AdminTaskStatus, CreateAdminTaskData,
} from '@/hooks/useAdminTasks';
import { formatDateUTC } from '@/lib/utils';

const MANAGER_ROLES = ['AUDIT_MANAGER', 'CAE', 'ADMIN', 'SUPER_ADMIN'];

const cls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const label = 'text-xs font-medium text-gray-600';

function isOverdue(task: AdminTask): boolean {
  if (!task.dueDate || task.status === 'DONE' || task.status === 'CANCELLED') return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

function NewTaskModal({ onClose }: { onClose: () => void }) {
  const { data: orgUsers = [] } = useOrgUsersList();
  const [form, setForm] = useState<CreateAdminTaskData>({ title: '' });
  const create = useCreateAdminTask();

  const set = (patch: Partial<CreateAdminTaskData>) => setForm(p => ({ ...p, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync(form);
      onClose();
    } catch { /* shown below */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Nueva Tarea Administrativa</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className={label}>Título *</label>
            <input required value={form.title} maxLength={200}
              onChange={e => set({ title: e.target.value })} className={cls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={label}>Descripción</label>
            <textarea rows={3} value={form.description ?? ''}
              onChange={e => set({ description: e.target.value })} className={cls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={label}>Responsable</label>
              <select value={form.assignedToId ?? ''} onChange={e => set({ assignedToId: e.target.value || undefined })} className={cls}>
                <option value="">A mí mismo</option>
                {orgUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={label}>Fecha límite</label>
              <input type="date" value={form.dueDate ?? ''} onChange={e => set({ dueDate: e.target.value })} className={cls} />
            </div>
          </div>

          {create.isError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {(create.error as Error)?.message ?? 'Error al crear la tarea'}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-gray-200 text-sm font-medium rounded-xl text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={create.isPending}
              className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-60">
              {create.isPending ? 'Creando…' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: AdminTask }) {
  const advanceStatus = useUpdateAdminTaskStatus();
  const deleteTask = useDeleteAdminTask();
  const next = NEXT_STATUS[task.status];
  const overdue = isOverdue(task);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 line-clamp-2">{task.title}</p>
        <button
          onClick={() => deleteTask.mutate(task.id)}
          disabled={deleteTask.isPending}
          className="shrink-0 text-gray-300 hover:text-red-500 disabled:opacity-40"
          title="Eliminar tarea"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {task.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>}

      <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-400">
        {task.assignedTo && (
          <span className="flex items-center gap-1">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 text-[9px] font-bold text-blue-700">
              {task.assignedTo.name.charAt(0).toUpperCase()}
            </span>
            {task.assignedTo.name}
          </span>
        )}
        {task.dueDate && (
          <span className={`flex items-center gap-1 ${overdue ? 'text-red-600 font-medium' : ''}`}>
            {overdue ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
            {formatDateUTC(task.dueDate)}
          </span>
        )}
      </div>

      {next && (
        <button
          onClick={() => advanceStatus.mutate({ id: task.id, status: next })}
          disabled={advanceStatus.isPending}
          className="mt-3 w-full text-left text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          {next === 'IN_PROGRESS' ? 'Iniciar →' : 'Marcar como hecha →'}
        </button>
      )}
      {task.status !== 'CANCELLED' && task.status !== 'DONE' && (
        <button
          onClick={() => advanceStatus.mutate({ id: task.id, status: 'CANCELLED' })}
          disabled={advanceStatus.isPending}
          className="mt-1 w-full text-left text-xs font-medium text-gray-400 hover:text-red-600 disabled:opacity-50"
        >
          Cancelar
        </button>
      )}
    </div>
  );
}

function BoardColumn({ status, tasks }: { status: AdminTaskStatus; tasks: AdminTask[] }) {
  const cfg = ADMIN_TASK_STATUS_CONFIG[status];
  return (
    <div className="flex flex-col w-80 flex-shrink-0 bg-gray-50 rounded-2xl border border-gray-200">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        <h3 className="text-sm font-semibold text-gray-700">{cfg.label}</h3>
        <span className="ml-auto text-xs font-medium text-gray-400 bg-white rounded-full px-2 py-0.5 border border-gray-200">
          {tasks.length}
        </span>
      </div>
      <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-260px)]">
        {tasks.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Sin tareas</p>
        ) : (
          tasks.map(t => <TaskCard key={t.id} task={t} />)
        )}
      </div>
    </div>
  );
}

export default function AdminTasksPage() {
  const { hasRole, user } = useUser();
  const isManager = hasRole(MANAGER_ROLES);
  const [onlyMine, setOnlyMine] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const { data: tasks = [], isLoading } = useAdminTasks(
    isManager && onlyMine && user ? { assignedToId: user.id } : undefined,
  );

  const byStatus = (status: AdminTaskStatus) => tasks.filter(t => t.status === status);
  const cancelled = tasks.filter(t => t.status === 'CANCELLED');

  return (
    <div className="flex flex-col h-full">
      <Header title="Tareas Administrativas" />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-gray-400" />
              {tasks.length} tarea{tasks.length !== 1 ? 's' : ''}
              {!isManager && ' asignadas a mí o creadas por mí'}
            </h2>
            {isManager && (
              <button
                onClick={() => setOnlyMine(o => !o)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  onlyMine
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Users2 className="w-3 h-3" />
                {onlyMine ? 'Solo mías' : 'Todo el equipo'}
              </button>
            )}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Nueva Tarea
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {BOARD_STATUSES.map(status => (
                <BoardColumn key={status} status={status} tasks={byStatus(status)} />
              ))}
            </div>

            {cancelled.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-3">
                <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                  <X className="w-3.5 h-3.5" /> {cancelled.length} cancelada{cancelled.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && <NewTaskModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
