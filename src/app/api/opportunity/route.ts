import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function supabaseAdmin(): SupabaseClient {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || mustEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function jsonError(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET(req: Request) {
  try {
    const supabase = supabaseAdmin();
    const { searchParams } = new URL(req.url);
    const message_id = (searchParams.get("message_id") || "").trim();

    if (!message_id) return jsonError(400, { ok: false, error: "message_id is required" });

    const { data, error } = await supabase
      .from("opportunity_cards_v1")
      .select("message_id,state,can_claim_now,starts_at,ends_at,access_block_id")
      .eq("message_id", message_id)
      .maybeSingle();

    if (error) {
      return jsonError(500, { ok: false, error: "DB_READ_FAILED", details: error });
    }

    return NextResponse.json({ ok: true, opportunity: data ?? null });
  } catch (e: any) {
    return jsonError(500, { ok: false, error: "SERVER_ERROR", message: String(e?.message ?? e) });
  }
}
