import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2022-11-15' });

export async function POST(req: NextRequest) {
  try {
    const { tagId, refCode, amountCents, channel: channelBody } = await req.json();

    if (!tagId || typeof tagId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid tagId' }, { status: 400 });
    }

    const amount = Number.isFinite(+amountCents) && +amountCents > 0 ? +amountCents : 500;

    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.headers.get('origin') ||
      'https://omninethq.co.uk';

    // Derive channel from body or request URL (?ch=...)
    const ch = (channelBody ||
      req.nextUrl.searchParams.get('ch') ||
      'direct') as string;

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
      // include tag and channel back to success page
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}&tag=${encodeURIComponent(
        tagId
      )}&ch=${encodeURIComponent(ch)}`,
      cancel_url: `${origin}/cancel?status=canceled`,
      metadata: {
        tagId,
        refCode: (refCode || '').toString(),
        channel: ch, // <- helpful for webhooks/server analytics too
      },
    });

    return NextResponse.json({ id: session.id, url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Stripe error' }, { status: 500 });
  }
}
