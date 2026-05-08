import { supabase } from '@/lib/supabase';
import { logActivity } from '@/lib/activityLog';

export async function incrementDocumentPrintCounter(docType: string, docId: string) {
  const t = String(docType || '').trim();
  const id = String(docId || '').trim();
  if (!t || !id) return 1;
  const { data, error } = await supabase.rpc('increment_document_print_counter' as any, {
    p_doc_type: t,
    p_doc_id: id,
  } as any);
  if (error) return 1;
  const n = Number(data);
  const cnt = Number.isFinite(n) && n > 0 ? n : 1;
  try {
    const storedUser = localStorage.getItem('app_user');
    if (storedUser) {
      const u = JSON.parse(storedUser);
      void logActivity({
        user_id: u?.id || null,
        username: u?.username || null,
        role: u?.role || null,
        action: 'PRINT',
        module: `PRINT_${t}`,
        entity_type: 'document',
        entity_id: `${t}:${id}`,
        details: `Cetakan ke-${cnt}`,
        meta: { doc_type: t, doc_id: id, print_count: cnt },
      });
    }
  } catch {}
  return cnt;
}
