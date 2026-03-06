import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  // SQLite returns 'YYYY-MM-DD HH:MM:SS' (space separator, no timezone)
  // Replace space with 'T' and append 'Z' only if no timezone info present
  const normalized = typeof date === 'string'
    ? (date.includes('T') ? date : date.replace(' ', 'T') + (date.length === 19 ? 'Z' : ''))
    : date;
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(d);
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    passed: 'badge-passed',
    failed: 'badge-failed',
    running: 'badge-running',
    queued: 'badge-queued',
    error: 'badge-error',
    cancelled: 'badge-cancelled',
  };
  return map[status] || 'badge-cancelled';
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    passed: 'Passou',
    failed: 'Falhou',
    running: 'Executando',
    queued: 'Na fila',
    error: 'Erro',
    cancelled: 'Cancelado',
    online: 'Online',
    offline: 'Offline',
    busy: 'Ocupado',
  };
  return map[status] || status;
}
