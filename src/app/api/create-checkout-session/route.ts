import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2022-11-15' });

export async function POST(req: NextRequest) {
  try {
    const { tagId, refCode, amountCents } = await req.json();

    if (!tagId || typeof tagId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid tagId' }, { status: 400 });
    }

    const amount = Number.isFinite(+amountCents) && +amountCents > 0 ? +amountCents : 500;

    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.headers.get('origin') ||
      'https://omninethq.co.uk';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: { name: `Support Tag ${tagId}` },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}&tag=${encodeURIComponent(
        tagId
      )}`,
      cancel_url: `${origin}/cancel?status=canceled`,
      // 👇 CRITICAL: add tagId + refCode to metadata
      metadata: {
        tagId,
        refCode: (refCode || '').toString(),
      },
    });

    return NextResponse.json({ id: session.id, url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Stripe error' }, { status: 500 });
  }
}
