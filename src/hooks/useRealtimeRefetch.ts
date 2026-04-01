import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

type PgChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

type UseRealtimeRefetchParams = {
  tables: string[];
  onRefetch: () => void | Promise<void>;
  enabled?: boolean;
  schema?: string;
  event?: PgChangeEvent;
  debounceMs?: number;
};

export function useRealtimeRefetch({
  tables,
  onRefetch,
  enabled = true,
  schema = 'public',
  event = '*',
  debounceMs = 250,
}: UseRealtimeRefetchParams) {
  const onRefetchRef = useRef(onRefetch);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    onRefetchRef.current = onRefetch;
  }, [onRefetch]);

  useEffect(() => {
    if (!enabled) return;
    if (!tables || tables.length === 0) return;

    const scheduleRefetch = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        onRefetchRef.current();
      }, debounceMs);
    };

    const channels = tables.map((table) =>
      supabase
        .channel(`rt:${schema}:${table}`)
        .on('postgres_changes', { event, schema, table }, () => {
          scheduleRefetch();
        })
        .subscribe()
    );

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      channels.forEach((ch) => {
        supabase.removeChannel(ch);
      });
    };
  }, [debounceMs, enabled, event, schema, tables]);
}

