import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const qToken = url.searchParams.get("token") || "";
    const hToken = req.headers.get("x-webhook-token") || "";

    const RESEND_WEBHOOK_TOKEN = Deno.env.get("RESEND_WEBHOOK_TOKEN") || "";
    const EDGE_SUPABASE_URL = Deno.env.get("EDGE_SUPABASE_URL") || "";
    const EDGE_SERVICE_ROLE_KEY = Deno.env.get("EDGE_SERVICE_ROLE_KEY") || "";

    if (!RESEND_WEBHOOK_TOKEN || !EDGE_SUPABASE_URL || !EDGE_SERVICE_ROLE_KEY) {
      console.error("Missing envs");
      return new Response("Missing envs", { status: 500 });
    }

    const okToken =
      (qToken && qToken === RESEND_WEBHOOK_TOKEN) ||
      (hToken && hToken === RESEND_WEBHOOK_TOKEN);
    if (!okToken) return new Response("Unauthorized", { status: 401 });

    const payload = await req.json();
    const type: string = payload?.type ?? "unknown";
    const data = payload?.data ?? {};

    const msg = data?.message ?? {};
    const message_id: string | undefined = msg?.id ?? data?.message_id ?? data?.id;
    const subject: string | undefined = msg?.subject ?? data?.subject ?? "";
    const to_email: string | undefined =
      (Array.isArray(data?.to) ? data.to[0] : data?.to) ||
      (Array.isArray(msg?.to) ? msg.to[0] : msg?.to) || "";

    const tags: string[] = Array.isArray(data?.tags) ? data.tags : [];
    let owner_id: string | null = null;
    let tag_id: string | null = null;
    let booking_id: string | null = null;
    for (const t of tags) {
      if (typeof t !== "string") continue;
      if (t.startsWith("owner:")) owner_id = t.slice(6);
      else if (t.startsWith("tag:")) tag_id = t.slice(4);
      else if (t.startsWith("booking:")) booking_id = t.slice(8);
    }

    const provider_status: string | undefined =
      data?.status ?? data?.delivery?.status ?? data?.event ?? "";
    const provider_reason: string | undefined =
      data?.reason ?? data?.delivery?.reason ?? "";

    const sb = createClient(EDGE_SUPABASE_URL, EDGE_SERVICE_ROLE_KEY);
    const { error } = await sb.from("email_events").insert({
      event_type: type,
      message_id,
      to_email,
      subject,
      owner_id,
      tag_id,
      booking_id,
      provider_status,
      provider_reason,
      raw: payload,
    });

    if (error) {
      console.error("Insert error:", error);
      return new Response("DB error", { status: 500 });
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("error", { status: 500 });
  }
});
