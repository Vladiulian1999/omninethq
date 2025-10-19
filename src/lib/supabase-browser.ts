'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/**
 * getSupabaseBrowser()
 * - Safe to import anywhere (no env reads at module scope)
 * - Only creates the client when CALLED (typically inside a client component/event)
 */
export function getSupabaseBrowser(): SupabaseClient {
  if (_client) return _client;

  // Read envs only when invoked (runtime, client)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If this somehow runs without envs in the browser, fail softly (no build-time throw)
  if (!url || !anon) {
    throw new Error('Supabase browser client missing public envs at runtime.');
  }

  _client = createClient(url, anon, {
    auth: { persistSession: true, detectSessionInUrl: true },
  });
  return _client;
}

