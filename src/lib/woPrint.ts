import { supabase } from '@/lib/supabase';
import { hasMenuAccess, isSuperAdmin } from '@/lib/permissions';
import { logActivity } from '@/lib/activityLog';
import type { User } from '@/context/AuthContext';

export type WoPrintMode = 'FIRST' | 'REPRINT';

function getLocalUser(): Partial<User> | null {
  try {
    const raw = localStorage.getItem('app_user');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function getSpkPrintMode(woId: string): Promise<WoPrintMode> {
  const id = String(woId || '').trim();
  if (!id) return 'FIRST';
  try {
    const { data, error } = await supabase
      .from('activity_logs' as any)
      .select('id')
      .eq('entity_type', 'work_orders')
      .eq('entity_id', id)
      .in('action', ['WO_PRINT', 'WO_REPRINT'])
      .limit(1);
    if (error) return 'FIRST';
    return Array.isArray(data) && data.length > 0 ? 'REPRINT' : 'FIRST';
  } catch {
    return 'FIRST';
  }
}

export type EnsureCanPrintResult = {
  mode: WoPrintMode;
  action: 'WO_PRINT' | 'WO_REPRINT';
};

export async function ensureCanPrintSpk(
  userInput: User | Partial<User> | null | undefined,
  woId: string,
): Promise<EnsureCanPrintResult> {
  const user = (userInput || getLocalUser() || null) as any;
  const mode = await getSpkPrintMode(woId);

  // SUPER_ADMIN selalu boleh
  if (isSuperAdmin(user as any)) {
    return { mode, action: mode === 'FIRST' ? 'WO_PRINT' : 'WO_REPRINT' };
  }

  // Print pertama kali boleh untuk yang punya akses transaksi WO
  if (mode === 'FIRST') {
    if (!hasMenuAccess(user as any, 'trans_wo')) {
      throw new Error('Anda tidak memiliki izin untuk print SPK.');
    }
    return { mode, action: 'WO_PRINT' };
  }

  // Reprint harus permission terpisah
  if (!hasMenuAccess(user as any, 'trans_wo_reprint')) {
    throw new Error('Anda tidak memiliki izin untuk reprint SPK.');
  }
  return { mode, action: 'WO_REPRINT' };
}

export async function logSpkPrintActivity(
  userInput: User | Partial<User> | null | undefined,
  woId: string,
  result: EnsureCanPrintResult,
  extraMeta?: any,
) {
  const user = (userInput || getLocalUser() || null) as any;
  const action = result.action;
  const label = action === 'WO_PRINT' ? 'Print SPK (first)' : 'Reprint SPK';
  await logActivity({
    user_id: user?.id ?? null,
    username: user?.username ?? null,
    role: user?.role ?? null,
    action,
    module: 'WORK_ORDER',
    entity_type: 'work_orders',
    entity_id: String(woId),
    details: label,
    meta: { ...((extraMeta as any) || {}), mode: result.mode },
  });
}
