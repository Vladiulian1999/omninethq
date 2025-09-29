// Edge Function: booking-notify (production, hardened)
// - INSERT: emails requester (confirmation) + owner (Accept/Decline links)
// - UPDATE: emails requester (Accepted/Declined)
// - Idempotent sends with X-Entity-Ref-ID
// - Fallback owner lookup (messages -> auth.user via Admin API)
// - Retry for Resend 429/5xx
// - "Accepted" includes Google Calendar link + ICS attachment (guarded)
// - Sender: notify@omninethq.co.uk
// - API key normalization (trim/unquote/remove "Bearer ") + fingerprint logging (no secrets)
// - Resend tags on all sends: ["booking","tag:<id>","owner:<uuid>","booking:<id>"]

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Payload = {
  type?: "INSERT" | "UPDATE" | "PING" | string;
  record?: Record<string, any>;
};

type Attachment = { filename: string; content: string }; // base64

const FROM = "OmniNet <notify@omninethq.co.uk>";
const RESEND_URL = "https://api.resend.com/emails";

/* ---------- utils ---------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function htmlEscape(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]!)
  );
}

function fmtDate(iso?: string) {
  try {
    if (!iso) return "(no date)";
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso ?? "");
  }
}

function toGoogleDate(iso: string) {
  // returns YYYYMMDDTHHMMSSZ
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

function makeIcs({
  uid,
  dtStartIso,
  summary,
  description,
  url,
  durationMinutes = 60,
}: {
  uid: string;
  dtStartIso: string;
  summary: string;
  description: string;
  url: string;
  durationMinutes?: number;
}) {
  const start = new Date(dtStartIso);
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  const fmtICS = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      d.getUTCFullYear().toString() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      "Z"
    );
  };

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OmniNet//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${fmtICS(new Date())}`,
    `DTSTART:${fmtICS(start)}`,
    `DTEND:${fmtICS(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description.replace(/\r?\n/g, "\\n")}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  const bytes = new TextEncoder().encode(ics);
  // @ts-ignore Deno specific
  const b64 = btoa(String.fromCharCode(...bytes));
  return { filename: "booking.ics", content: b64 } as Attachment;
}

function normalizeApiKey(k?: string) {
  // Trim whitespace, strip wrapping single/double quotes, remove accidental "Bearer " prefix, strip BOM
  const s = (k ?? "").replace(/^\uFEFF/, "").trim();
  const unquoted = s.replace(/^['"]|['"]$/g, "");
  const noBearer = unquoted.replace(/^Bearer\s+/i, "");
  return noBearer;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Build Resend tags so webhooks can attribute events to OmniNet objects */
function buildTags(ownerId?: string, tagId?: string, bookingId?: string): string[] {
  const tags: string[] = ["booking"]; // generic type
  if (tagId) tags.push(`tag:${tagId}`);
  if (ownerId) tags.push(`owner:${ownerId}`);
  if (bookingId) tags.push(`booking:${bookingId}`);
  return tags;
}

async function sendEmail({
  apiKey,
  to,
  subject,
  html,
  text,
  replyTo,
  label,
  idempotencyKey,
  attachments,
  tags, // <-- NEW
  maxRetries = 3,
}: {
  apiKey: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  label?: string;
  idempotencyKey?: string;
  attachments?: Attachment[];
  tags?: string[]; // <-- NEW
  maxRetries?: number;
}) {
  const toStr = Array.isArray(to) ? to.join(", ") : to;
  const body: Record<string, unknown> = { from: FROM, to, subject, html };
  if (text) body.text = text;
  if (replyTo) body.reply_to = replyTo;
  if (attachments?.length) body.attachments = attachments;
  if (tags?.length) body.tags = tags; // <-- NEW

  let attempt = 0;
  while (true) {
    attempt++;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (idempotencyKey) headers["X-Entity-Ref-ID"] = idempotencyKey;

    console.log(`${label ?? "Email"} → to: ${toStr} | subject: ${subject} | attempt: ${attempt}`);
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const textBody = await res.text();
    console.log(`Resend status (${label ?? "Email"}):`, res.status);
    console.log(`Resend body   (${label ?? "Email"}):`, textBody);

    if (res.ok) return true;

    // retry on 429/5xx
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const wait = 300 * attempt; // simple backoff
      await sleep(wait);
      continue;
    }
    return false;
  }
}

/* ---------- function ---------- */

serve(async (req: Request) => {
  try {
    const RAW_RESEND = Deno.env.get("RESEND_API_KEY") || "";
    const RESEND_API_KEY = normalizeApiKey(RAW_RESEND);
    const EDGE_SUPABASE_URL = Deno.env.get("EDGE_SUPABASE_URL") || "";
    const EDGE_SERVICE_ROLE_KEY = Deno.env.get("EDGE_SERVICE_ROLE_KEY") || "";

    // Safe fingerprint log (no secrets revealed)
    const fp = await sha256Hex(RESEND_API_KEY);
    console.log(
      "ENV check:",
      "RESEND", RESEND_API_KEY.startsWith("re_"), "len:", RESEND_API_KEY.length, "fp:", fp.slice(0, 8),
      "| EDGE_URL", !!EDGE_SUPABASE_URL,
      "| EDGE_SR", EDGE_SERVICE_ROLE_KEY.length > 20
    );

    if (!RESEND_API_KEY) {
      console.error("Missing RESEND_API_KEY");
      return new Response(JSON.stringify({ ok: false, error: "Missing RESEND_API_KEY" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    const payload = (await req.json()) as Payload;
    console.log("Incoming payload:", JSON.stringify(payload));

    const type = payload?.type;
    const record = payload?.record || {};
    if (type === "PING") {
      return new Response(JSON.stringify({ ok: true, pong: record }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (!type || !record) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid payload" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Extract fields
    const bookingId: string = String(record.id ?? "").trim();
    const tagId: string = String(record.tag_id ?? "").trim();
    const requesterEmail: string = String(record.requester_email ?? "").trim();
    let ownerEmail: string = String(record.owner_email ?? "").trim();
    let ownerId: string = String(record.owner_id ?? "").trim();
    const requesterName: string = String(record.requester_name ?? "").trim();
    const requesterPhone: string = String(record.requester_phone ?? "").trim();
    const message: string = String(record.message ?? "").trim();
    const preferredAt: string | undefined = record.preferred_at ?? undefined;

    // Fallback owner resolution (belt & braces)
    if ((!ownerEmail || !ownerId) && EDGE_SUPABASE_URL && EDGE_SERVICE_ROLE_KEY && tagId) {
      const sb = createClient(EDGE_SUPABASE_URL, EDGE_SERVICE_ROLE_KEY);
      if (!ownerId) {
        const { data: tagRow, error: tagErr } = await sb
          .from("messages")
          .select("user_id")
          .eq("id", tagId)
          .single();
        if (tagErr) console.warn("Fallback: messages.user_id error:", tagErr);
        ownerId = String(tagRow?.user_id ?? ownerId ?? "");
      }
      if (!ownerEmail && ownerId) {
        const { data: userResp, error: userErr } = await sb.auth.admin.getUserById(ownerId);
        if (userErr) console.warn("Fallback: admin.getUserById error:", userErr);
        ownerEmail = String(userResp?.user?.email ?? ownerEmail ?? "");
      }
    }

    // Build tags once we have resolved ownerId/tagId/bookingId
    const emailTags = buildTags(ownerId, tagId, bookingId);

    /* ----- INSERT: send requester + owner ----- */
    if (type === "INSERT") {
      // Requester confirmation
      if (requesterEmail) {
        const subject = "📅 Booking Request Received";
        const html = `
          <h2>Thanks for your booking request!</h2>
          <p>Preferred date: <strong>${htmlEscape(fmtDate(preferredAt))}</strong></p>
          <p>We’ve notified the tag owner. You’ll hear back soon.</p>
        `;
        const text =
          `Thanks for your booking request!\n` +
          `Preferred date: ${fmtDate(preferredAt)}\n` +
          `We’ve notified the tag owner. You’ll hear back soon.\n`;

        await sendEmail({
          apiKey: RESEND_API_KEY,
          to: requesterEmail,
          subject,
          html,
          text,
          label: "Requester confirmation",
          idempotencyKey: `req-confirm-${bookingId}`,
          tags: emailTags, // <-- tags
        });
      } else {
        console.warn("INSERT: requesterEmail missing");
      }

      // Owner notification with action links
      if (ownerEmail && tagId) {
        const ownerLink = `https://omninethq.co.uk/tag/${encodeURIComponent(tagId)}`;
        const acceptLink = `${ownerLink}?action=accept&booking=${encodeURIComponent(bookingId)}`;
        const declineLink = `${ownerLink}?action=decline&booking=${encodeURIComponent(bookingId)}`;

        const ownerHtml = `
          <h2>New booking request</h2>
          <p><b>Preferred date:</b> ${htmlEscape(fmtDate(preferredAt))}</p>
          <p><b>From:</b> ${htmlEscape(requesterName || "(no name)")} &lt;${htmlEscape(requesterEmail || "(no email)")}&gt;</p>
          ${requesterPhone ? `<p><b>Phone:</b> ${htmlEscape(requesterPhone)}</p>` : ""}
          ${message ? `<p><b>Message:</b> ${htmlEscape(message)}</p>` : ""}
          <div style="margin:20px 0;">
            <a href="${acceptLink}" style="background:#16a34a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;margin-right:10px;">✅ Accept</a>
            <a href="${declineLink}" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">❌ Decline</a>
          </div>
          <p>Or open the request: <a href="${ownerLink}" target="_blank">${ownerLink}</a></p>
        `;
        const ownerText =
          `New booking request\n` +
          `Preferred date: ${fmtDate(preferredAt)}\n` +
          `From: ${requesterName || "(no name)"} <${requesterEmail || "(no email)"}>\n` +
          (requesterPhone ? `Phone: ${requesterPhone}\n` : "") +
          (message ? `Message: ${message}\n` : "") +
          `Accept: ${acceptLink}\nDecline: ${declineLink}\nOpen: ${ownerLink}\n`;

        await sendEmail({
          apiKey: RESEND_API_KEY,
          to: ownerEmail,
          subject: "📅 New Booking Request on Your Tag",
          html: ownerHtml,
          text: ownerText,
          replyTo: requesterEmail || undefined,
          label: "Owner notification",
          idempotencyKey: `owner-notify-${bookingId}`,
          tags: emailTags, // <-- tags
        });
      } else {
        console.warn("INSERT: ownerEmail or tagId missing", { ownerEmail, tagId, ownerId });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    /* ----- UPDATE: send requester outcome ----- */
    if (type === "UPDATE") {
      const status: string = String(record.status ?? "");
      if (!requesterEmail) {
        console.warn("UPDATE: requesterEmail missing; skipping outcome email.");
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (status === "accepted") {
        // Calendar helpers
        const start = preferredAt ? toGoogleDate(preferredAt) : "";
        const end = preferredAt
          ? toGoogleDate(new Date(new Date(preferredAt).getTime() + 60 * 60_000).toISOString())
          : "";
        const textTitle = "OmniNet Booking Confirmed";
        const details = `Your booking was accepted.\nTag: ${tagId}\n`;
        const gcal = start && end
          ? `https://calendar.google.com/calendar/render?action=TEMPLATE&dates=${start}/${end}&text=${encodeURIComponent(textTitle)}&details=${encodeURIComponent(details)}`
          : "";

        const subject = "✅ Your Booking was Accepted!";
        const html = `
          <h2>Good news!</h2>
          <p>Your booking for <strong>${htmlEscape(fmtDate(preferredAt))}</strong> has been <b>ACCEPTED</b>.</p>
          ${gcal ? `<p><a href="${gcal}" target="_blank">➕ Add to Google Calendar</a></p>` : ""}
          <p>The tag owner will contact you soon.</p>
        `;
        const text =
          `Good news! Your booking for ${fmtDate(preferredAt)} has been ACCEPTED.\n` +
          (gcal ? `Add to Google Calendar: ${gcal}\n` : "") +
          `The tag owner will contact you soon.\n`;

        // Try with ICS attachment; if it fails, send without attachment
        let attachments: Attachment[] | undefined = undefined;
        try {
          if (preferredAt) {
            const ics = makeIcs({
              uid: `booking-${bookingId}@omninethq.co.uk`,
              dtStartIso: preferredAt,
              summary: "OmniNet Booking",
              description: `Your booking was accepted.\nTag: ${tagId}\n`,
              url: `https://omninethq.co.uk/tag/${encodeURIComponent(tagId)}`,
              durationMinutes: 60,
            });
            attachments = [ics];
          }
        } catch (e) {
          console.warn("ICS generation failed, sending without attachment.", e);
        }

        const sent = await sendEmail({
          apiKey: RESEND_API_KEY,
          to: requesterEmail,
          subject,
          html,
          text,
          label: "Requester accepted",
          idempotencyKey: `req-accepted-${bookingId}`,
          attachments,
          tags: emailTags, // <-- tags
        });

        if (!sent && attachments?.length) {
          console.warn("Retry accepted email without ICS attachment.");
          await sendEmail({
            apiKey: RESEND_API_KEY,
            to: requesterEmail,
            subject,
            html,
            text,
            label: "Requester accepted (no ICS)",
            idempotencyKey: `req-accepted-noics-${bookingId}`,
            tags: emailTags, // <-- tags
          });
        }
      } else if (status === "declined") {
        const subject = "❌ Your Booking was Declined";
        const html = `
          <h2>We’re sorry.</h2>
          <p>Your booking for <strong>${htmlEscape(fmtDate(preferredAt))}</strong> was <b>DECLINED</b>.</p>
          <p>You can try another time or reach out to the owner.</p>
        `;
        const text =
          `We’re sorry. Your booking for ${fmtDate(preferredAt)} was DECLINED.\n` +
          `You can try another time or reach out to the owner.\n`;

        await sendEmail({
          apiKey: RESEND_API_KEY,
          to: requesterEmail,
          subject,
          html,
          text,
          label: "Requester declined",
          idempotencyKey: `req-declined-${bookingId}`,
          tags: emailTags, // <-- tags
        });
      } else {
        console.log("UPDATE with unhandled status:", status);
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Unknown type
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      status: 200,
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
