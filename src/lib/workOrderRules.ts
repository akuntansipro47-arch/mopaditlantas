export type NormalizedWorkOrderStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'UNKNOWN';

/**
 * Work Order hanya memiliki tiga status operational:
 * OPEN -> IN_PROGRESS (label PROGRESS) -> COMPLETED.
 *
 * CLOSE/CLOSED dan variasinya dinormalisasi ke COMPLETED untuk membaca data
 * lama sebelum/selama migrasi database diterapkan.
 */
export function normalizeWorkOrderStatus(status: unknown): NormalizedWorkOrderStatus {
  const value = String(status || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (value === 'OPEN') return 'OPEN';
  if (value === 'IN_PROGRESS' || value === 'PROGRESS') return 'IN_PROGRESS';
  if (value === 'COMPLETED' || value === 'COMPLETE' || value === 'CLOSE' || value === 'CLOSED') {
    return 'COMPLETED';
  }
  if (value === 'CANCELLED') return 'CANCELLED';
  return 'UNKNOWN';
}

export function isWorkOrderDone(status: unknown) {
  return normalizeWorkOrderStatus(status) === 'COMPLETED';
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
  if (value === 'IN_PROGRESS') return 'bg-blue-100 text-blue-700';
  if (value === 'CANCELLED') return 'bg-red-100 text-red-700';
  return 'bg-yellow-100 text-yellow-700';
}

export function getWorkOrderStatusLabel(status: unknown) {
  const value = normalizeWorkOrderStatus(status);
  if (value === 'OPEN') return 'OPEN';
  if (value === 'IN_PROGRESS') return 'PROGRESS';
  if (value === 'COMPLETED') return 'COMPLETED';
  if (value === 'CANCELLED') return 'CANCELLED';
  return 'UNKNOWN';
}
