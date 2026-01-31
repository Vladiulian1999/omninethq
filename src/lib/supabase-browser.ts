'use client'

import { createBrowserClient } from '@supabase/ssr'

let _client: ReturnType<typeof createBrowserClient> | null = null

/**
 * Canonical browser Supabase client (SSR helpers).
 * Keeps session cookies in sync with Next middleware.
 */
export function getSupabaseBrowser(): ReturnType<typeof createBrowserClient> {
  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    throw new Error('Supabase browser client missing public envs at runtime.')
  }

  _client = createBrowserClient(url, anon)
  return _client
}
