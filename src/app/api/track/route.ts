import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => ({}));
    const {
      event_type,
      page,
      variant,
      tag_id,
      ref_code,
      session_id,
      meta,
    } = payload || {};

    if (!event_type) {
      return NextResponse.json({ error: "event_type required" }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    const { error } = await supabase.from("events").insert({
      event_type: String(event_type).slice(0, 100),
      page: page ? String(page).slice(0, 200) : null,
      variant: variant ? String(variant).slice(0, 100) : null,
      tag_id: tag_id ? String(tag_id).slice(0, 200) : null,
      ref_code: ref_code ? String(ref_code).slice(0, 100) : null,
      session_id: session_id ? String(session_id).slice(0, 200) : null,
      meta: meta && typeof meta === "object" ? meta : null,
    });

    if (error) {
      console.error("[track] insert error:", error.message);
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[track] handler error:", e?.message || e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
