// Edge Function: availability-notify
// - Sends owner email after successful availability claim
// - For reserve / enquire / book claim-first flows
// - Idempotent owner send keyed by availability action id
// - Fallback owner lookup via availability_blocks -> messages -> auth user
// - Retry for Resend 429/5xx
// - Sender: notify@omninethq.co.uk

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Payload = {
  type?: "CLAIM" | "PING" | string;
  record?: Record<string, any>;
};

type TagKV = { name: string; value: string };

const FROM = "OmniNet <notify@omninethq.co.uk>";
const RESEND_URL = "https://api.resend.com/emails";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function htmlEscape(s: string) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]!)
  );
}

function normalizeApiKey(k?: string) {
  const s = (k ?? "").replace(/^\uFEFF/, "").trim();
  const unquoted = s.replace(/^['"]|['"]$/g, "");
  return unquoted.replace(/^Bearer\s+/i, "");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fmtDate(iso?: string | null) {
  try {
    if (!iso) return "now";
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso ?? "now");
  }
}

function sanitizeTagValue(v: string) {
  return String(v).replace(/[^A-Za-z0-9_-]/g, "-");
}

function buildTags(ownerId?: string, tagId?: string, actionId?: string): TagKV[] {
  const kv: TagKV[] = [{ name: "type", value: "availability" }];
  if (tagId) kv.push({ name: "tag", value: sanitizeTagValue(tagId) });
  if (ownerId) kv.push({ name: "owner", value: sanitizeTagValue(ownerId) });
  if (actionId) kv.push({ name: "action", value: sanitizeTagValue(actionId) });
  return kv;
}

async function sendEmail({
  apiKey,
  to,
  subject,
  html,
  text,
  label,
  idempotencyKey,
  tags,
  maxRetries = 3,
}: {
  apiKey: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  label?: string;
  idempotencyKey?: string;
  tags?: TagKV[];
  maxRetries?: number;
}) {
  const body: Record<string, unknown> = {
    from: FROM,
    to,
    subject,
    html,
  };
  if (text !== undefined) body.text = text;
  if (tags?.length) body.tags = tags;

  let attempt = 0;

  while (true) {
    attempt++;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    console.log(`${label ?? "Email"} -> attempt ${attempt}`);

    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const textBody = await res.text();

    console.log(`Resend status (${label ?? "Email"}):`, res.status);
    console.log(`Resend body   (${label ?? "Email"}):`, textBody);

    if (res.ok) return true;

    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      await sleep(300 * attempt);
      continue;
    }

    return false;
  }
}

serve(async (req: Request) => {
  try {
    const RAW_RESEND = Deno.env.get("RESEND_API_KEY") || "";
    const RESEND_API_KEY = normalizeApiKey(RAW_RESEND);
    const EDGE_SUPABASE_URL = Deno.env.get("EDGE_SUPABASE_URL") || "";
    const EDGE_SERVICE_ROLE_KEY = Deno.env.get("EDGE_SERVICE_ROLE_KEY") || "";
    const PUBLIC_SITE_URL = Deno.env.get("PUBLIC_SITE_URL") || "https://omninethq.co.uk";

    const fp = await sha256Hex(RESEND_API_KEY);

    console.log(
      "ENV check:",
      "RESEND", RESEND_API_KEY.startsWith("re_"), "len:", RESEND_API_KEY.length, "fp:", fp.slice(0, 8),
      "| EDGE_URL", !!EDGE_SUPABASE_URL,
      "| EDGE_SR", EDGE_SERVICE_ROLE_KEY.length > 20
    );

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "Missing RESEND_API_KEY" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    if (!EDGE_SUPABASE_URL || !EDGE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "Missing Supabase edge env" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    const payload = (await req.json()) as Payload;
    const type = payload?.type;
    const record = payload?.record || {};

    if (type === "PING") {
      return new Response(JSON.stringify({ ok: true, pong: record }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (type !== "CLAIM") {
      return new Response(JSON.stringify({ ok: false, error: "Unsupported type" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const actionId = String(record.action_id ?? "").trim();
    const blockId = String(record.block_id ?? "").trim();
    const tagIdFromPayload = String(record.tag_id ?? "").trim();

    if (!actionId || !blockId) {
      return new Response(JSON.stringify({ ok: false, error: "Missing action_id or block_id" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const sb = createClient(EDGE_SUPABASE_URL, EDGE_SERVICE_ROLE_KEY);

    const { data: blockRow, error: blockErr } = await sb
      .from("availability_blocks")
      .select("id, tag_id, owner_id, title, start_at, end_at, action_type, capacity_remaining, capacity_total")
      .eq("id", blockId)
      .single();

    if (blockErr || !blockRow) {
      console.error("availability_blocks lookup error:", blockErr);
      return new Response(JSON.stringify({ ok: false, error: "Block not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    let ownerId = String(blockRow.owner_id ?? "").trim();
    const tagId = String(blockRow.tag_id ?? tagIdFromPayload ?? "").trim();

    if (!ownerId && tagId) {
      const { data: tagRow, error: tagErr } = await sb
        .from("messages")
        .select("user_id")
        .eq("id", tagId)
        .single();

      if (tagErr) console.warn("Fallback messages.user_id error:", tagErr);
      ownerId = String(tagRow?.user_id ?? "");
    }

    if (!ownerId) {
      return new Response(JSON.stringify({ ok: false, error: "Owner not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    const { data: userResp, error: userErr } = await sb.auth.admin.getUserById(ownerId);
    if (userErr) {
      console.error("admin.getUserById error:", userErr);
      return new Response(JSON.stringify({ ok: false, error: "Owner email lookup failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    const ownerEmail = String(userResp?.user?.email ?? "").trim();
    if (!ownerEmail) {
      return new Response(JSON.stringify({ ok: false, error: "Owner email missing" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    const emailTags = buildTags(ownerId, tagId, actionId);
    const ownerLink = `${PUBLIC_SITE_URL}/tag/${encodeURIComponent(tagId)}/availability`;
    const publicTagLink = `${PUBLIC_SITE_URL}/tag/${encodeURIComponent(tagId)}`;

    const title = String(blockRow.title ?? "Availability");
    const actionType = String(blockRow.action_type ?? "reserve");
    const startAt = blockRow.start_at ? fmtDate(String(blockRow.start_at)) : "now";
    const remaining =
      blockRow.capacity_remaining == null ? "Unlimited" : String(blockRow.capacity_remaining);
    const total =
      blockRow.capacity_total == null ? "Unlimited" : String(blockRow.capacity_total);

    const subject =
      actionType === "reserve"
        ? "🔔 New Reserve Claim on Your Tag"
        : actionType === "book"
          ? "🔔 New Claimed Booking Slot on Your Tag"
          : "🔔 New Availability Claim on Your Tag";

    const html = `
      <h2>New availability claim</h2>
      <p><b>Title:</b> ${htmlEscape(title)}</p>
      <p><b>Action:</b> ${htmlEscape(actionType)}</p>
      <p><b>Start:</b> ${htmlEscape(startAt)}</p>
      <p><b>Remaining:</b> ${htmlEscape(remaining)} / ${htmlEscape(total)}</p>
      <p><b>Action ID:</b> ${htmlEscape(actionId)}</p>
      <div style="margin:20px 0;">
        <a href="${ownerLink}" style="background:#111;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">
          View availability claims
        </a>
      </div>
      <p>Public tag: <a href="${publicTagLink}" target="_blank">${publicTagLink}</a></p>
    `;

    const text =
      `New availability claim\n` +
      `Title: ${title}\n` +
      `Action: ${actionType}\n` +
      `Start: ${startAt}\n` +
      `Remaining: ${remaining} / ${total}\n` +
      `Action ID: ${actionId}\n` +
      `Owner view: ${ownerLink}\n` +
      `Public tag: ${publicTagLink}\n`;

    const sent = await sendEmail({
      apiKey: RESEND_API_KEY,
      to: ownerEmail,
      subject,
      html,
      text,
      label: "Availability owner notification",
      idempotencyKey: `availability-owner-notify-${actionId}`,
      tags: emailTags,
    });

    return new Response(JSON.stringify({ ok: sent, owner_id: ownerId, to_email: ownerEmail }), {
      status: sent ? 200 : 502,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});