  import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

serve(async (req) => {
  const payload = await req.json()
  const booking = payload.record
  const type = payload.type // "INSERT" or "UPDATE"

  let subject = ""
  let html = ""
  let recipients: string[] = []

  if (type === "INSERT") {
    // Confirmation to requester
    subject = "📅 Booking Request Received"
    html = `
      <h2>Thanks for your booking request!</h2>
      <p>We received your request for <strong>${new Date(
        booking.preferred_at
      ).toLocaleString()}</strong>.</p>
      <p>The tag owner will get back to you soon.</p>
    `
    recipients.push(booking.requester_email)

    // Notify owner separately
    if (booking.owner_email) {
      const ownerLink = `https://omninethq.co.uk/tag/${booking.tag_id}`
      const acceptLink = `${ownerLink}?action=accept&booking=${booking.id}`
      const declineLink = `${ownerLink}?action=decline&booking=${booking.id}`

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "OmniNet <notify@omninethq.co.uk>",
          to: booking.owner_email,
          subject: "📅 New Booking Request on Your Tag",
          html: `
            <h2>You have a new booking request</h2>
            <p><b>Preferred date:</b> ${new Date(
              booking.preferred_at
            ).toLocaleString()}</p>
            <p><b>Message:</b> ${booking.notes || "(no message)"}</p>
            <div style="margin:20px 0;">
              <a href="${acceptLink}" style="background:#16a34a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;margin-right:10px;">✅ Accept</a>
              <a href="${declineLink}" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">❌ Decline</a>
            </div>
            <p>Or open the full request here: <a href="${ownerLink}" target="_blank">${ownerLink}</a></p>
          `,
        }),
      })
    }
  } else if (type === "UPDATE") {
    if (booking.status === "accepted") {
      subject = "✅ Your Booking was Accepted!"
      html = `
        <h2>Good news!</h2>
        <p>Your booking for <strong>${new Date(
          booking.preferred_at
        ).toLocaleString()}</strong> has been <b>ACCEPTED</b>.</p>
        <p>The tag owner will contact you soon.</p>
      `
    } else if (booking.status === "declined") {
      subject = "❌ Your Booking was Declined"
      html = `
        <h2>We’re sorry.</h2>
        <p>Your booking for <strong>${new Date(
          booking.preferred_at
        ).toLocaleString()}</strong> was <b>DECLINED</b>.</p>
        <p>You can try booking another time or contacting the owner.</p>
      `
    }
    recipients.push(booking.requester_email)
  }

  if (!subject || recipients.length === 0) {
    return new Response(JSON.stringify({ ok: false, reason: "No email needed" }))
  }

  // Send to requester (or whoever is in recipients)
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "OmniNet <notify@omninethq.co.uk>",
      to: recipients,
      subject,
      html,
    }),
  })

  return new Response(JSON.stringify({ ok: true }))
})
