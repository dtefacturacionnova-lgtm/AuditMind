import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = 'CLP'): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date): string {
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const diff = (new Date(date).getTime() - Date.now()) / 1000;
  const absDiff = Math.abs(diff);

  if (absDiff < 60) return rtf.format(Math.round(diff), 'seconds');
  if (absDiff < 3600) return rtf.format(Math.round(diff / 60), 'minutes');
  if (absDiff < 86400) return rtf.format(Math.round(diff / 3600), 'hours');
  return rtf.format(Math.round(diff / 86400), 'days');
}

export function truncate(str: string, length: number): string {
  return str.length > length ? `${str.slice(0, length)}…` : str;
}
