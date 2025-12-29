import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2022-11-15' });

function cleanStr(v: any) {
  return (v ?? '').toString().trim();
}

function cleanId(v: any) {
  // keep dashes/underscores, only strip spaces + angle brackets
  return cleanStr(v).replace(/[<>\s]/g, '');
}

export async function POST(req: NextRequest) {
  let body: any = null;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    // ✅ accept multiple possible keys (prevents breaking when client differs)
    const tagId =
      cleanId(body?.tagId) ||
      cleanId(body?.tag) ||
      cleanId(body?.id) ||
      cleanId(body?.tag_id);

    if (!tagId) {
      return NextResponse.json(
        { error: 'Missing or invalid tagId', received: Object.keys(body || {}) },
        { status: 400 }
      );
    }

    // ✅ Availability additions (optional)
    const blockId =
      cleanId(body?.blockId) ||
      cleanId(body?.block_id) ||
      cleanId(body?.availabilityBlockId);

    const availabilityActionId =
      cleanId(body?.availabilityActionId) ||
      cleanId(body?.availability_action_id) ||
      cleanId(body?.actionId);

    const refCode = cleanStr(body?.refCode);
    const amountCentsRaw = body?.amountCents;

    const ch = cleanStr(body?.ch).toLowerCase(); // whatsapp/sms/copy/system
    const cv = cleanStr(body?.cv).toUpperCase(); // A/B etc

    const amount =
      Number.isFinite(+amountCentsRaw) && +amountCentsRaw > 0 ? +amountCentsRaw : 500;

    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.headers.get('origin') ||
      'https://omninethq.co.uk';

    const successUrl = new URL(`${origin}/success`);
    successUrl.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
    successUrl.searchParams.set('tag', tagId);
    if (ch) successUrl.searchParams.set('ch', ch);
    if (cv) successUrl.searchParams.set('cv', cv);

    // Helpful for UI/debugging (webhook is still the truth)
    if (blockId) successUrl.searchParams.set('block', blockId);
    if (availabilityActionId) successUrl.searchParams.set('aa', availabilityActionId);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      locale: 'en',
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: blockId ? `Support Tag ${tagId} (Block)` : `Support Tag ${tagId}`,
              metadata: {
                tagId,
                ...(blockId ? { blockId } : {}),
              },
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl.toString(),
      cancel_url: `${origin}/cancel?status=canceled`,
      metadata: {
        tagId,
        refCode: (refCode || '').toString(),
        ch: (ch || '').toString(),
        cv: (cv || '').toString(),
        // ✅ Availability metadata for webhook confirmation
        blockId: (blockId || '').toString(),
        availabilityActionId: (availabilityActionId || '').toString(),
      },
    });

    return NextResponse.json({ id: session.id, url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Stripe error' }, { status: 500 });
  }
}
