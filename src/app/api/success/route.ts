import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2022-11-15",
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      // Allow page to render a generic success even without a session (just in case)
      return NextResponse.json({ ok: true });
    }

    // Retrieve the session securely (server-side)
    const s = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer_details"],
    });

    const amount_cents = s.amount_total ?? 0;
    const currency = (s.currency ?? "gbp").toLowerCase();
    const tagId = (s.metadata?.tagId ?? null) as string | null;
    const refCode = (s.metadata?.refCode ?? null) as string | null;
    const customer_name = (s.customer_details?.name ?? null) as string | null;
    const customer_email = (s.customer_details?.email ?? null) as string | null;

    return NextResponse.json({
      ok: true,
      amount_cents,
      currency,
      tagId,
      refCode,
      customer_name,
      customer_email,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Stripe session lookup failed" },
      { status: 500 }
    );
  }
}
