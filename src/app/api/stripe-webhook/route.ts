import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2022-11-15' });

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

function isUuid(v?: string | null) {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    const raw = await req.text(); // raw body required
    event = stripe.webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error('[webhook] signature fail:', err?.message);
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object as Stripe.Checkout.Session;

      const amount = s.amount_total ?? 0;
      const currency = (s.currency ?? 'gbp').toLowerCase();
      const stripeSessionId = s.id;

      const tagIdRaw = (s.metadata?.tagId ?? '').toString();
      const refCodeRaw = (s.metadata?.refCode ?? '').toString();

      const tagIdClean = tagIdRaw.replace(/[<>\s]/g, '');
      const tagId = isUuid(tagIdClean) ? tagIdClean : null;
      const refCode = refCodeRaw.trim().toLowerCase() || null;

      console.log('[webhook] session', {
        id: stripeSessionId,
        amount,
        currency,
        tagIdRaw,
        tagId,
        refCode,
      });

      // If tagId missing/invalid, skip insert to avoid DB errors
      if (!tagId) {
        console.warn('[webhook] missing/invalid tagId, skipping insert');
        return NextResponse.json({ received: true }, { status: 200 });
      }

      const supabase = getServiceSupabase();

      let referrer_user_id: string | null = null;
      if (refCode) {
        const { data: refUser, error: refErr } = await supabase
          .from('users')
          .select('id')
          .eq('referral_code', refCode)
          .maybeSingle();
        if (refErr) console.warn('[webhook] ref lookup error:', refErr.message);
        referrer_user_id = refUser?.id ?? null;
      }

      const { error: insertErr } = await supabase.from('donations').insert({
        tag_id: tagId,
        amount_cents: amount,
        currency,
        stripe_session_id: stripeSessionId,
        referral_code: refCode,
        referrer_user_id,
      });

      if (insertErr) {
        const msg = String(insertErr.message || '');
        if (!msg.includes('duplicate key')) {
          console.error('[webhook] insert error:', insertErr);
          throw insertErr;
        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error('[webhook] handler error:', err?.message || err);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
