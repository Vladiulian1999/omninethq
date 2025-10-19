// Edge Function: resend-webhook
// Persists Resend events to public.email_events.
// Auth: header x-webhook-token OR ?token= must equal RESEND_WEBHOOK_TOKEN.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type TagKV = { name: string; value: string };

function s(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function normalizeKey(k?: string) {
  const raw = (k ?? "").replace(/^\uFEFF/, "").trim();
  const unquoted = raw.replace(/^['"]|['"]$/g, "");
  return unquoted.replace(/^Bearer\s+/i, "");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

serve(async (req: Request) => {
  try {
    const EDGE_SUPABASE_URL = s(Deno.env.get("EDGE_SUPABASE_URL"));
    const EDGE_SERVICE_ROLE_KEY = normalizeKey(Deno.env.get("EDGE_SERVICE_ROLE_KEY"));
    const RESEND_WEBHOOK_TOKEN = s(Deno.env.get("RESEND_WEBHOOK_TOKEN"));

    // Safe env fingerprint
    const fp = await sha256Hex(EDGE_SERVICE_ROLE_KEY);
    console.log(
      "ENV check | URL:", !!EDGE_SUPABASE_URL,
      "| SR len:", EDGE_SERVICE_ROLE_KEY.length,
      "| SR fp:", fp.slice(0,8),
      "| WH:", RESEND_WEBHOOK_TOKEN ? "set" : "missing"
    );

    if (!EDGE_SUPABASE_URL || !EDGE_SERVICE_ROLE_KEY) {
      console.error("Missing EDGE_SUPABASE_URL or EDGE_SERVICE_ROLE_KEY");
      return new Response("Server misconfigured", { status: 500 });
    }

    // Auth
    const u = new URL(req.url);
    const tokenParam = u.searchParams.get("token") ?? "";
    const tokenHeader = req.headers.get("x-webhook-token") ?? "";
    if (!RESEND_WEBHOOK_TOKEN || (tokenParam !== RESEND_WEBHOOK_TOKEN && tokenHeader !== RESEND_WEBHOOK_TOKEN)) {
      console.warn("Unauthorized webhook call");
      return new Response("Unauthorized", { status: 401 });
    }

    const sb = createClient(EDGE_SUPABASE_URL, EDGE_SERVICE_ROLE_KEY);

    // Parse payload (Resend may send single object)
    const payload = await req.json().catch(() => ({}));
    const events = Array.isArray(payload) ? payload : [payload];

    let inserted = 0;

    for (const e of events) {
      // Typical Resend fields
      let type = s(e?.type).toLowerCase();               // "email.sent", "email.delivered", ...
      const data = e?.data ?? {};
      const message = data?.message ?? {};

      const createdAt =
        data?.timestamp || data?.created_at || e?.created_at || new Date().toISOString();

      const message_id = s(message?.id || data?.email_id || data?.id || e?.id);
      const subject = s(message?.subject || data?.subject);
      const toField = data?.to ?? message?.to ?? data?.recipient ?? data?.recipients;
      const to_email = Array.isArray(toField) ? s(toField[0]) : s(toField);

      const status = s(data?.status || message?.status || type).toLowerCase();

      // Tags: KV array, string array, or object map
      let owner_id: string | null = null;
      let tag_id: string | null = null;
      let booking_id: string | null = null;

      const tags = data?.tags ?? e?.tags ?? message?.tags ?? [];

      if (Array.isArray(tags)) {
        for (const t of tags) {
          if (t && typeof t === "object" && "name" in t) {
            const kv = t as TagKV;
            const name = s(kv.name);
            const val = s(kv.value);
            if (name === "owner") owner_id = val || owner_id;
            else if (name === "tag") tag_id = val || tag_id;
            else if (name === "booking") booking_id = val || booking_id;
          } else if (typeof t === "string") {
            const [k, v] = t.split(":", 2);
            if (k === "owner") owner_id = v ?? owner_id;
            else if (k === "tag") tag_id = v ?? tag_id;
            else if (k === "booking") booking_id = v ?? booking_id;
          }
        }
      } else if (tags && typeof tags === "object") {
        for (const [k, v] of Object.entries(tags)) {
          const val = s(v);
          if (k === "owner") owner_id = val;
          else if (k === "tag") tag_id = val;
          else if (k === "booking") booking_id = val;
        }
      }

      const row = {
        ts: new Date(createdAt).toISOString(),
        event_type: type || null,   // DB constraint already allows "email.sent" and "sent"
        status: status || null,
        message_id: message_id || null,
        subject: subject || null,
        to_email: to_email || null,
        owner_id: owner_id || null,
        tag_id: tag_id || null,
        booking_id: booking_id || null,
        raw: e ?? null,
      };

      const { error } = await sb.from("email_events").insert(row);
      if (error) {
        console.error("Insert email_events error:", error);
      } else {
        inserted++;
      }
    }

    const ok = inserted > 0;
    return new Response(JSON.stringify({ ok, inserted }), {
      status: ok ? 200 : 500,    // fail loudly if nothing persisted
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("resend-webhook error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});

