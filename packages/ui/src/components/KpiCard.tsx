import * as React from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
  icon?: React.ReactNode;
  variant?: 'default' | 'danger' | 'warning' | 'success' | 'info';
  loading?: boolean;
}

const VARIANT_STYLES = {
  default: 'border-slate-200 bg-white',
  danger:  'border-red-200 bg-red-50',
  warning: 'border-amber-200 bg-amber-50',
  success: 'border-emerald-200 bg-emerald-50',
  info:    'border-blue-200 bg-blue-50',
};

const TREND_COLOR = (value: number) =>
  value > 0 ? 'text-emerald-600' : value < 0 ? 'text-red-500' : 'text-gray-500';

export function KpiCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  variant = 'default',
  loading = false,
}: KpiCardProps) {
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${VARIANT_STYLES[variant]}`}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {icon && <span className="text-gray-400">{icon}</span>}
      </div>

      {loading ? (
        <div className="mt-3 h-8 w-24 animate-pulse rounded bg-gray-200" />
      ) : (
        <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
          {value}
        </p>
      )}

      {(subtitle || trend) && (
        <div className="mt-2 flex items-center gap-2">
          {trend && (
            <span className={`text-xs font-semibold ${TREND_COLOR(trend.value)}`}>
              {trend.value > 0 ? '↑' : trend.value < 0 ? '↓' : '→'} {Math.abs(trend.value)}%
            </span>
          )}
          {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}
