import { createClient } from '@supabase/supabase-js';

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: fetchWithRetry,
  },
});
