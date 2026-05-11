import { CasePriority, CaseStatus } from './types';

export function StatusBadge({ status }: { status: CaseStatus }) {
  return <span className={`badge status-${status}`}>{status}</span>;
}

export function PriorityBadge({ priority }: { priority: CasePriority }) {
  return <span className={`badge prio-${priority}`}>{priority}</span>;
}

export function formatDate(s: string): string {
  const d = new Date(s);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
