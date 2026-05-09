import { supabase } from '@/lib/supabase';

type ActivityLogPayload = {
  user_id?: string | null;
  username?: string | null;
  role?: string | null;
  action: string;
  module?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  details?: string | null;
  meta?: any;
};

export async function logActivity(payload: ActivityLogPayload) {
  try {
    const p = payload || ({} as any);
    const action = String(p.action || '').trim();
    if (!action) return;

    let fallbackUser: any = null;
    try {
      const raw = localStorage.getItem('app_user');
      if (raw) fallbackUser = JSON.parse(raw);
    } catch {
      fallbackUser = null;
    }

    const { error } = await supabase.from('activity_logs' as any).insert([
      {
        user_id: p.user_id ?? fallbackUser?.id ?? null,
        username: p.username ?? fallbackUser?.username ?? null,
        role: p.role ?? fallbackUser?.role ?? null,
        action,
        module: p.module ?? null,
        entity_type: p.entity_type ?? null,
        entity_id: p.entity_id ?? null,
        details: p.details ?? null,
        meta: p.meta ?? {},
      },
    ] as any);
    if (error) return;
  } catch {
    return;
  }
}
