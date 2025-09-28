// deno-lint-ignore-file no-explicit-any
import { serve } from "std/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Minimal shared-secret gate. Set RESEND_WEBHOOK_TOKEN in secrets.
// (You can later upgrade to Resend's signature verification.)
const TOKEN = Deno.env.get("RESEND_WEBHOOK_TOKEN") || "";

const supabaseUrl = Deno.env.get("EDGE_SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("EDGE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

function parseTagValue(tags: string[] | undefined, key: string): string | null {
  if (!tags || !Array.isArray(tags)) return null;
  for (const t of tags) {
    // expecting "owner:UUID" / "tag:UUID" / "booking:UUID"
    const [k, v] = String(t).split(":");
    if (k === key && v) return v;
  }
  return null;
}

serve(async (req) => {
  try {
    // Require token either in header "x-webhook-token" or ?token=
    const url = new URL(req.url);
    const tokenHeader = req.headers.get("x-webhook-token");
    const tokenQuery = url.searchParams.get("token");
    const ok = TOKEN && (tokenHeader === TOKEN || tokenQuery === TOKEN);
    if (!ok) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Resend sends JSON. Keep raw for storage.
    const body = await req.json();

    // Resend payloads vary by event type; normalize a few fields safely.
    // See https://resend.com/docs (we avoid hard-coding exact shapes; we store raw too).
    const eventType: string =
      body?.type || body?.event || body?.data?.event || "unknown";

    const data = body?.data ?? body;

    const messageId: string | undefined =
      data?.message?.id ?? data?.object?.id ?? data?.message_id;

    const toEmail: string | undefined =
      data?.to ?? data?.recipient ?? data?.email ?? data?.message?.to;

    const fromEmail: string | undefined =
      data?.from ?? data?.sender ?? data?.message?.from;

    const subject: string | undefined =
      data?.subject ?? data?.message?.subject;

    const reason: string | undefined =
      data?.reason ?? data?.error ?? data?.bounce?.type ?? data?.details;

    const status: string | undefined =
      data?.status ?? data?.delivery?.status ?? undefined;

    // Tags we add when sending via booking-notify (see section 3)
    const tags: string[] | undefined = data?.tags;
    const tagId = parseTagValue(tags, "tag");
    const ownerId = parseTagValue(tags, "owner");
    const bookingId = parseTagValue(tags, "booking");

    // Event timestamp (fallback to now)
    const ts: string =
      data?.created_at ?? data?.timestamp ?? new Date().toISOString();

    const { error } = await supabase
      .from("email_events")
      .insert({
        provider: "resend",
        message_id: messageId,
        event_type: String(eventType),
        to_email: toEmail,
        from_email: fromEmail,
        subject,
        reason,
        status,
        tag_id: tagId,
        owner_id: ownerId as any, // uuid
        booking_id: bookingId as any, // uuid
        ts,
        raw: body,
      });

    if (error) {
      // Log once; Resend will retry on 5xx if configured
      console.error("email_events insert error:", error);
      return new Response("DB error", { status: 500 });
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("resend-webhook error:", e);
    return new Response("Bad Request", { status: 400 });
  }
});
