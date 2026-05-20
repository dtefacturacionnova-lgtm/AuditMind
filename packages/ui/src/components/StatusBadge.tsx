import * as React from 'react';

type StatusVariant =
  | 'draft' | 'planned' | 'in_progress' | 'fieldwork' | 'review'
  | 'reporting' | 'completed' | 'cancelled' | 'suspended'
  | 'open' | 'pending' | 'resolved' | 'closed'
  | 'critical' | 'high' | 'medium' | 'low' | 'minimal'
  | 'default';

const VARIANT_STYLES: Record<StatusVariant, string> = {
  draft:      'bg-gray-100 text-gray-700 border-gray-200',
  planned:    'bg-blue-50 text-blue-700 border-blue-200',
  in_progress:'bg-indigo-50 text-indigo-700 border-indigo-200',
  fieldwork:  'bg-violet-50 text-violet-700 border-violet-200',
  review:     'bg-amber-50 text-amber-700 border-amber-200',
  reporting:  'bg-orange-50 text-orange-700 border-orange-200',
  completed:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled:  'bg-red-50 text-red-600 border-red-200',
  suspended:  'bg-gray-100 text-gray-500 border-gray-200',
  open:       'bg-yellow-50 text-yellow-700 border-yellow-200',
  pending:    'bg-blue-50 text-blue-600 border-blue-200',
  resolved:   'bg-green-50 text-green-700 border-green-200',
  closed:     'bg-gray-100 text-gray-600 border-gray-200',
  critical:   'bg-red-100 text-red-700 border-red-300',
  high:       'bg-orange-100 text-orange-700 border-orange-300',
  medium:     'bg-yellow-100 text-yellow-700 border-yellow-300',
  low:        'bg-blue-100 text-blue-700 border-blue-300',
  minimal:    'bg-green-100 text-green-700 border-green-300',
  default:    'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  PLANNED: 'Planificada',
  IN_PROGRESS: 'En Progreso',
  FIELDWORK: 'Trabajo de Campo',
  REVIEW: 'En Revisión',
  REPORTING: 'Reportería',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  SUSPENDED: 'Suspendida',
  OPEN: 'Abierto',
  PENDING: 'Pendiente',
  RESOLVED: 'Resuelto',
  CLOSED: 'Cerrado',
  CRITICAL: 'Crítico',
  HIGH: 'Alto',
  MEDIUM: 'Medio',
  LOW: 'Bajo',
  MINIMAL: 'Mínimo',
  PENDING_REVIEW: 'Pend. Revisión',
  APPROVED: 'Aprobado',
  COMMUNICATED: 'Comunicado',
  IN_REMEDIATION: 'En Remediación',
  DISPUTED: 'Disputado',
  ACCEPTED_RISK: 'Riesgo Aceptado',
};

function toVariant(status: string): StatusVariant {
  const key = status.toLowerCase().replace(/_/g, '_') as StatusVariant;
  return key in VARIANT_STYLES ? key : 'default';
}

interface StatusBadgeProps {
  status: string;
  label?: string;
  size?: 'sm' | 'md';
  dot?: boolean;
}

export function StatusBadge({ status, label, size = 'md', dot = false }: StatusBadgeProps) {
  const variant = toVariant(status);
  const styles = VARIANT_STYLES[variant];
  const displayLabel = label ?? STATUS_LABELS[status] ?? status;
  const sizeClass = size === 'sm'
    ? 'px-1.5 py-0.5 text-[11px]'
    : 'px-2.5 py-0.5 text-xs';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-medium ${sizeClass} ${styles}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {displayLabel}
    </span>
  );
}
