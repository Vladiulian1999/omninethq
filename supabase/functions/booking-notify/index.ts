// Edge Function: booking-notify
// - INSERT: emails requester + owner (Accept/Decline links)
// - UPDATE: emails requester on accepted/declined
// - Sender: notify@omninethq.co.uk (verified)
// - Fallback: if owner_email missing, fetch via owner_id from users table
// - Env vars: EDGE_SUPABASE_URL, EDGE_SERVICE_ROLE_KEY, RESEND_API_KEY

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Payload = {
  type?: "INSERT" | "UPDATE" | "PING" | string;
  record?: Record<string, any>;
};

const FROM = "OmniNet <notify@omninethq.co.uk>";
const RESEND_URL = "https://api.resend.com/emails";

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

async function sendEmail({
  apiKey,
  to,
  subject,
  html,
  replyTo,
}: {
  apiKey: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}) {
  const body: Record<string, unknown> = { from: FROM, to, subject, html };
  if (replyTo) body.reply_to = replyTo;

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log("Resend status:", res.status);
  console.log("Resend body:", text);
  return { status: res.status, body: text };
}

serve(async (req: Request) => {
  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("EDGE_SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("EDGE_SERVICE_ROLE_KEY");

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
    if (!type || !record) {
      console.error("Invalid payload, missing type/record");
      return new Response(JSON.stringify({ ok: false, error: "Invalid payload" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (type === "PING") {
      return new Response(JSON.stringify({ ok: true, pong: record }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    let requesterEmail = (record.requester_email || "").toString().trim();
    let ownerEmail = (record.owner_email || "").toString().trim();
    const ownerId = (record.owner_id || "").toString().trim();
    const tagId = (record.tag_id || "").toString().trim();

    // Fallback lookup if ownerEmail missing
    if (!ownerEmail && ownerId && SUPABASE_URL && SERVICE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
        const { data, error } = await supabase
          .from("users") // adjust if different
          .select("email")
          .eq("id", ownerId)
          .single();
        if (error) console.error("Owner email lookup error:", error);
        if (data?.email) {
          ownerEmail = String(data.email).trim();
          console.log("Owner email resolved via lookup:", ownerEmail);
        }
      } catch (e) {
        console.error("Owner email lookup threw:", e);
      }
    }

    let subject = "";
    let html = "";
    let recipients: string[] = [];

    if (type === "INSERT") {
      subject = "📅 Booking Request Received";
      html = `
        <h2>Thanks for your booking request!</h2>
        <p>Preferred date: <strong>${htmlEscape(fmtDate(record.preferred_at))}</strong></p>
        <p>We’ve notified the tag owner. You’ll hear back soon.</p>
      `;
      if (requesterEmail) recipients.push(requesterEmail);

      if (ownerEmail && tagId) {
        const ownerLink = `https://omninethq.co.uk/tag/${encodeURIComponent(tagId)}`;
        const acceptLink = `${ownerLink}?action=accept&booking=${encodeURIComponent(record.id || "")}`;
        const declineLink = `${ownerLink}?action=decline&booking=${encodeURIComponent(record.id || "")}`;

        const ownerHtml = `
          <h2>New booking request</h2>
          <p><b>Preferred date:</b> ${htmlEscape(fmtDate(record.preferred_at))}</p>
          <p><b>From:</b> ${htmlEscape(record.requester_name || "(no name)")} &lt;${htmlEscape(requesterEmail || "(no email)")}&gt;</p>
          ${record.requester_phone ? `<p><b>Phone:</b> ${htmlEscape(record.requester_phone)}</p>` : ""}
          ${record.message ? `<p><b>Message:</b> ${htmlEscape(record.message)}</p>` : ""}
          <div style="margin:20px 0;">
            <a href="${acceptLink}" style="background:#16a34a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;margin-right:10px;">✅ Accept</a>
            <a href="${declineLink}" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">❌ Decline</a>
          </div>
          <p>Or open the request: <a href="${ownerLink}" target="_blank">${ownerLink}</a></p>
        `;

        console.log("Sending owner email to:", ownerEmail);
        await sendEmail({
          apiKey: RESEND_API_KEY,
          to: ownerEmail,
          subject: "📅 New Booking Request on Your Tag",
          html: ownerHtml,
          replyTo: requesterEmail || undefined,
        });
      } else {
        console.warn("Owner email skipped. ownerEmail:", ownerEmail, "tagId:", tagId);
      }
    } else if (type === "UPDATE") {
      const status = (record.status || "").toString();
      if (status === "accepted") {
        subject = "✅ Your Booking was Accepted!";
        html = `
          <h2>Good news!</h2>
          <p>Your booking for <strong>${htmlEscape(fmtDate(record.preferred_at))}</strong> has been <b>ACCEPTED</b>.</p>
          <p>The tag owner will contact you soon.</p>
        `;
      } else if (status === "declined") {
        subject = "❌ Your Booking was Declined";
        html = `
          <h2>We’re sorry.</h2>
          <p>Your booking for <strong>${htmlEscape(fmtDate(record.preferred_at))}</strong> was <b>DECLINED</b>.</p>
          <p>You can try another time or reach out to the owner.</p>
        `;
      } else {
        console.log("UPDATE with non-status change or unhandled status:", status);
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (requesterEmail) recipients.push(requesterEmail);
    } else {
      console.log("Unknown type:", type);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (!subject || recipients.length === 0) {
      console.log("Nothing to send (subject/recipients empty)");
      return new Response(JSON.stringify({ ok: true, noop: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    await sendEmail({
      apiKey: RESEND_API_KEY,
      to: recipients,
      subject,
      html,
    });

    return new Response(JSON.stringify({ ok: true }), {
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
