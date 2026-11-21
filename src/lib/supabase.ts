import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Public project settings. The publishable key is meant to ship in browser code: every table is
 * protected by row-level security, so a user can only ever read/write their own rows.
 * Override with VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (set both to "" to disable cloud).
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://vqgwqhhkwhmntnqkcfej.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_Okkv2n8eUPWQVJnXiLDEnw_dyBwPnc9';

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          flowType: 'pkce', // returns ?code=… instead of tokens in the #hash, which the HashRouter uses
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const cloudEnabled = supabase !== null;
