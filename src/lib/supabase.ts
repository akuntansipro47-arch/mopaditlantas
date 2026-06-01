import { createClient } from '@supabase/supabase-js';
import { createDemoSupabase, isDemoMode } from '@/lib/demoSupabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const SUPABASE_URL = supabaseUrl;

const fetchWithRetry: typeof fetch = async (input, init) => {
  const method = String(init?.method || 'GET').toUpperCase();
  const canRetry = method === 'GET' || method === 'HEAD';
  const maxRetries = canRetry ? 2 : 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(input, init);
    } catch (e: any) {
      const msg = String(e?.message || '');
      const isNetwork = e instanceof TypeError || msg.includes('Failed to fetch') || msg.includes('NetworkError');
      if (!isNetwork || attempt >= maxRetries) throw e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }

  return await fetch(input, init);
};

const realSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: fetchWithRetry,
  },
});

const demoSupabase = createDemoSupabase();

function pickClient() {
  return isDemoMode() ? demoSupabase : realSupabase;
}

export const supabase = new Proxy({} as any, {
  get(_target, prop) {
    const client: any = pickClient();
    const value = client[prop as any];
    if (typeof value === 'function') return value.bind(client);
    return value;
  },
}) as any;
