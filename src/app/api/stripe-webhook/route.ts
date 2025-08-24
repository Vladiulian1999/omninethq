import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2022-11-15' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;

  try {
    const raw = await req.text(); // raw body required
    event = stripe.webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err.message}` },
      { status: 400 }
    );
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      const amount = session.amount_total ?? 0;
      const currency = session.currency?.toLowerCase() ?? 'gbp';
      const stripeSessionId = session.id;
      const tagId = session.metadata?.tagId ?? null;
      const refCodeRaw = session.metadata?.refCode ?? '';
      const refCode = refCodeRaw ? String(refCodeRaw).toLowerCase() : null;

      // Resolve referrer user by referral_code (optional)
      let referrer_user_id: string | null = null;
      if (refCode) {
        const { data: refUser } = await supabase
          .from('users')
          .select('id')
          .eq('referral_code', refCode)
          .maybeSingle();
        referrer_user_id = refUser?.id ?? null;
      }

      // Idempotent insert
      const { error: insertErr } = await supabase
        .from('donations')
        .insert({
          tag_id: tagId,
          amount_cents: amount,
          currency,
          stripe_session_id: stripeSessionId,
          referral_code: refCode,
          referrer_user_id,
        });

      // Ignore duplicates (webhook retries)
      if (insertErr && !String(insertErr.message).includes('duplicate key')) {
        throw insertErr;
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Webhook error' }, { status: 500 });
  }
}
