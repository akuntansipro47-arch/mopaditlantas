export type NormalizedWorkOrderStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'UNKNOWN';

export function normalizeWorkOrderStatus(status: unknown): NormalizedWorkOrderStatus {
  const value = String(status || '').trim().toUpperCase();
  if (value === 'OPEN') return 'OPEN';
  if (value === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (value === 'COMPLETED') return 'COMPLETED';
  if (value === 'CLOSED') return 'CLOSED';
  if (value === 'CANCELLED') return 'CANCELLED';
  return 'UNKNOWN';
}

export function isWorkOrderDone(status: unknown) {
  const value = normalizeWorkOrderStatus(status);
  return value === 'COMPLETED' || value === 'CLOSED';
}

export function isWorkOrderActive(status: unknown) {
  const value = normalizeWorkOrderStatus(status);
  return value === 'OPEN' || value === 'IN_PROGRESS';
}

export function isWorkOrderCancelled(status: unknown) {
  return normalizeWorkOrderStatus(status) === 'CANCELLED';
}

export function getWorkOrderStatusBadgeClass(status: unknown) {
  const value = normalizeWorkOrderStatus(status);
  if (value === 'COMPLETED') return 'bg-green-100 text-green-700';
  if (value === 'CLOSED') return 'bg-slate-100 text-slate-700';
  if (value === 'IN_PROGRESS') return 'bg-blue-100 text-blue-700';
  if (value === 'CANCELLED') return 'bg-red-100 text-red-700';
  return 'bg-yellow-100 text-yellow-700';
}

export function getWorkOrderStatusLabel(status: unknown) {
  const value = normalizeWorkOrderStatus(status);
  return value === 'UNKNOWN' ? String(status || '-') : value.replace('_', ' ');
}
