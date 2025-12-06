import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2022-11-15' });

/**
 * Server-only Supabase client (SERVICE ROLE). Never expose this key to the browser.
 * Supports either SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY env names.
 */
function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '';
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE(_KEY) is missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    const raw = await req.text(); // Stripe needs raw body
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

      // metadata carried from checkout creation
      const tagIdRaw = (s.metadata?.tagId ?? '').toString();
      const tagId = tagIdRaw.replace(/[<>\s]/g, '');
      const refCodeRaw = (s.metadata?.refCode ?? '').toString();
      const refCode = refCodeRaw.trim().toLowerCase() || null;
      const channelRaw = (s.metadata?.channel ?? '').toString();
      const channel = (channelRaw || 'direct').toLowerCase();

      if (!tagId) {
        console.warn('[webhook] missing tagId; skipping inserts');
        return NextResponse.json({ received: true }, { status: 200 });
      }

      const supabase = getServiceSupabase();

      // --- 1) Optional: keep your donations record (idempotent via unique stripe_session_id)
      const donationPayload = {
        tag_id: tagId,                 // TEXT
        amount_cents: amount,          // INT
        currency,                      // TEXT
        stripe_session_id: stripeSessionId, // TEXT UNIQUE (ensure unique index in DB)
        referral_code: refCode,        // TEXT nullable
        referrer_user_id: null as string | null, // filled if code matches
      };

      if (refCode) {
        const { data: refUser, error: refErr } = await supabase
          .from('users')
          .select('id')
          .eq('referral_code', refCode)
          .maybeSingle();
        if (refErr) console.warn('[webhook] ref lookup error:', refErr.message);
        donationPayload.referrer_user_id = refUser?.id ?? null;
      }

      // Try to insert; if duplicate (same session id), ignore
      const { error: donationsErr } = await supabase
        .from('donations')
        .insert(donationPayload);
      if (donationsErr) {
        const msg = donationsErr.message.toLowerCase();
        if (!msg.includes('duplicate') && !msg.includes('unique')) {
          console.error('[webhook] donations insert error:', donationsErr.message);
        }
      }

      // --- 2) Server-truth funnel: analytics_events checkout_success (idempotent by session id in meta)
      const analyticsPayload = {
        event: 'checkout_success',
        tag_id: tagId,
        channel,            // <- attribution
        experiment_id: null,
        variant: null,
        anon_id: null,
        referrer: null,
        meta: {
          stripe_session_id: stripeSessionId,
          amount_cents: amount,
          currency,
          ref_code: refCode,
        } as Record<string, any>,
      };

      const { error: analyticsErr } = await supabase
        .from('analytics_events')
        .insert(analyticsPayload);
      if (analyticsErr) {
        const msg = analyticsErr.message.toLowerCase();
        // If we created a unique index on (meta->>'stripe_session_id') for checkout_success, duplicates are expected on retries.
        if (!msg.includes('duplicate') && !msg.includes('unique')) {
          console.error('[webhook] analytics insert error:', analyticsErr.message);
        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error('[webhook] handler error:', err?.message || err);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
