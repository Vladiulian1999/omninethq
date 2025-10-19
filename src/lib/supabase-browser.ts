'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/**
 * Browser-only Supabase client.
 * - Safe to import anywhere (no work at module load)
 * - Lazily reads NEXT_PUBLIC_* envs the first time you call it
 * - Persists session in the browser
 */
export function getSupabaseBrowser(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Don't throw at import time; only validate when actually called in the browser.
  if (!url || !anon) {
    throw new Error('Supabase browser client missing public envs at runtime.');
  }

  _client = createClient(url, anon, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  });

  return _client;
}

/* Optional: also export a noop server getter here if you were importing it from this file by mistake. */
export function getSupabaseServer(): never {
  throw new Error('getSupabaseServer() should not be imported from supabase-browser. Use "@/lib/supabase".');
}



