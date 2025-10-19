// Browser-only Supabase client factory
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (typeof window === "undefined") {
    // Guard: never call this during SSR/prerender
    throw new Error("getSupabaseBrowser() must be called in the browser");
  }
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    // Don’t crash the build; surface a clear runtime error in the browser
    console.warn("Supabase env missing: NEXT_PUBLIC_SUPABASE_URL / ANON_KEY");
    // Create a dummy endpoint to avoid throwing; requests will fail gracefully
    _client = createClient("https://example.supabase.co", "public-anon-key");
    return _client;
  }

  _client = createClient(url, anon);
  return _client;
}
