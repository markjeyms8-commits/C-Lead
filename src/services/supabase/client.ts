import { createClient } from '@supabase/supabase-js';
import { backendEnv } from '@/config/env';
export const supabase = backendEnv
  ? createClient(
      backendEnv.VITE_SUPABASE_URL,
      backendEnv.VITE_SUPABASE_ANON_KEY,
      {
        global: {
          fetch: (input, init) => {
            if (!navigator.onLine) return Promise.reject(new Error('offline'));
            return fetch(input, init);
          },
        },
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      },
    )
  : null;
export function requireClient() {
  if (!supabase) throw new Error('Backend is not configured');
  return supabase;
}
