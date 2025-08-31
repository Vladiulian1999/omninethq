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

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    const raw = await req.text();
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

      // Accept your short tag IDs like "tag-2eb00"
      const tagIdRaw = (s.metadata?.tagId ?? '').toString();
      const tagId = tagIdRaw.replace(/[<>\s]/g, ''); // sanitize
      const refCodeRaw = (s.metadata?.refCode ?? '').toString();
      const refCode = refCodeRaw.trim().toLowerCase() || null;

      console.log('[webhook] session', {
        id: stripeSessionId, amount, currency, tagIdRaw, tagId, refCode
      });

      if (!tagId) {
        console.warn('[webhook] missing tagId; skipping insert');
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

      const { error: insertErr } = await supabase
        .from('donations')
        .insert({
          tag_id: tagId,                 // now TEXT, not UUID
          amount_cents: amount,
          currency,
          stripe_session_id: stripeSessionId,
          referral_code: refCode,
          referrer_user_id
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
