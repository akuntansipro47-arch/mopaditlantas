import type { User } from '@/context/AuthContext';

const PERMISSION_ALIASES: Record<string, string[]> = {
  report_issuedetail: ['report_issue_detail', 'report_goods_issue_detail', 'report_issue'],
  report_wodetail: ['report_wo'],
  report_item_history: ['report_stock'],
  report_inventory_value: ['report_stock'],
};

function normalizeMenus(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdmin(user: User | null | undefined): boolean {
  return String(user?.role || '').trim().toUpperCase() === 'SUPER_ADMIN';
}

export function getAllowedMenus(user: User | null | undefined): string[] {
  return normalizeMenus(user?.allowed_menus);
}

export function hasMenuAccess(user: User | null | undefined, key: string): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  const permissionKey = String(key || '').trim().toLowerCase();
  if (!permissionKey) return false;
  if (permissionKey === 'report_activity_log') return false;

  const allowed = getAllowedMenus(user);
  if (allowed.includes('*')) return true;
  if (permissionKey === 'reports') {
    return allowed.includes('reports') || allowed.some((item) => item.startsWith('report_'));
  }

  const aliases = PERMISSION_ALIASES[permissionKey] || [];
  return [permissionKey, ...aliases].some((candidate) => allowed.includes(candidate));
}

export function hasAnyMenuAccess(
  user: User | null | undefined,
  keys: string[] | null | undefined,
): boolean {
  if (!Array.isArray(keys) || keys.length === 0) return false;
  return keys.some((key) => hasMenuAccess(user, key));
}

export function hasAnyReportAccess(user: User | null | undefined): boolean {
  return hasMenuAccess(user, 'reports');
}
