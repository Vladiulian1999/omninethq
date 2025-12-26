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
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE(_KEY) is missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

function cleanText(v: any) {
  return (v ?? '').toString().trim();
}

function safeLower(v: any) {
  return cleanText(v).toLowerCase();
}

function safeUpper(v: any) {
  return cleanText(v).toUpperCase();
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
      const tagIdRaw = cleanText(s.metadata?.tagId);
      const tagId = tagIdRaw.replace(/[<>\s]/g, '');
      const refCodeRaw = cleanText(s.metadata?.refCode);
      const refCode = refCodeRaw ? refCodeRaw.trim().toLowerCase() : null;

      // ✅ NEW: channel + copy variant from metadata (we set these in create-checkout-session)
      const shareChannelRaw = safeLower(s.metadata?.ch);
      const copyVariantRaw = safeUpper(s.metadata?.cv);

      const share_channel = shareChannelRaw || null; // e.g. whatsapp/sms/copy/system
      const copy_variant = copyVariantRaw || null;   // e.g. A/B

      if (!tagId) {
        console.warn('[webhook] missing tagId; skipping inserts');
        return NextResponse.json({ received: true }, { status: 200 });
      }

      const supabase = getServiceSupabase();

      // Resolve referrer_user_id from referral_code
      let referrer_user_id: string | null = null;
      if (refCode) {
        const { data: refUser, error: refErr } = await supabase
          .from('users')
          .select('id')
          .eq('referral_code', refCode)
          .maybeSingle();

        if (refErr) console.warn('[webhook] ref lookup error:', refErr.message);
        referrer_user_id = (refUser as any)?.id ?? null;
      }

      // --- 1) donations insert (idempotent via unique stripe_session_id)
      // IMPORTANT: ensure you already ran:
      // alter table public.donations add column if not exists share_channel text, add column if not exists copy_variant text;
      const donationPayload = {
        tag_id: tagId,
        amount_cents: amount,
        currency,
        stripe_session_id: stripeSessionId,
        referral_code: refCode,
        referrer_user_id,

        // ✅ NEW fields
        share_channel,
        copy_variant,
      };

      const { error: donationsErr } = await supabase.from('donations').insert(donationPayload);
      if (donationsErr) {
        const msg = donationsErr.message.toLowerCase();
        // Stripe retries webhooks; duplicates are normal if unique constraint exists
        if (!msg.includes('duplicate') && !msg.includes('unique')) {
          console.error('[webhook] donations insert error:', donationsErr.message);
        }
      }

      // --- 2) analytics_events server-truth checkout_success
      // This is optional if you're already logging checkout_success client-side, but it's good to have server truth.
      const analyticsPayload = {
        event: 'checkout_success',
        tag_id: tagId,
        channel: share_channel || 'direct',
        experiment_id: null,
        variant: null,
        anon_id: null,
        referrer: null,
        meta: {
          stripe_session_id: stripeSessionId,
          amount_cents: amount,
          currency,
          ref_code: refCode,
          share_channel,
          copy_variant,
        } as Record<string, any>,
      };

      const { error: analyticsErr } = await supabase.from('analytics_events').insert(analyticsPayload);
      if (analyticsErr) {
        const msg = analyticsErr.message.toLowerCase();
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


