import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { logOperationalEvent } from '@/lib/operationalEvents';

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

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE(_KEY) is missing');

  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizeCurrency(v: unknown) {
  const currency = cleanStr(v).toLowerCase();
  return currency || 'gbp';
}

function makePublicRef() {
  return `clm_${randomBytes(24).toString('base64url')}`;
}

async function ensurePublicRef(supabase: any, actionId: string) {
  const { data: existing, error: existingError } = await supabase
    .from('availability_actions')
    .select('id, public_ref')
    .eq('id', actionId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing) throw new Error('Availability action not found.');

  const existingRef = cleanStr(existing.public_ref);
  if (existingRef) return existingRef;

  console.warn('availability checkout action missing public_ref; generating server fallback.', { actionId });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = makePublicRef();
    const { data, error } = await supabase
      .from('availability_actions')
      .update({ public_ref: candidate })
      .eq('id', actionId)
      .is('public_ref', null)
      .select('public_ref')
      .maybeSingle();

    if (!error && data?.public_ref) return cleanStr(data.public_ref);
    if (error && (error as any).code === '23505') continue;

    const { data: raced, error: racedError } = await supabase
      .from('availability_actions')
      .select('public_ref')
      .eq('id', actionId)
      .maybeSingle();

    if (!racedError && raced?.public_ref) return cleanStr(raced.public_ref);
    if (error) throw error;
    if (racedError) throw racedError;
  }

  throw new Error('Could not generate claim reference.');
}

export async function POST(req: NextRequest) {
  let body: any = null;

  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'INVALID_JSON', { message: 'Invalid JSON body' });
  }

  try {
    // Accept multiple possible keys to preserve existing callers.
    const requestTagId =
      cleanId(body?.tagId) ||
      cleanId(body?.tag) ||
      cleanId(body?.id) ||
      cleanId(body?.tag_id);

    const requestBlockId =
      cleanId(body?.blockId) ||
      cleanId(body?.block_id) ||
      cleanId(body?.availabilityBlockId);

    const requestClaimRef =
      cleanId(body?.claimRef) ||
      cleanId(body?.claim_ref) ||
      cleanId(body?.publicRef) ||
      cleanId(body?.public_ref);

    const refCode = cleanStr(body?.refCode);
    const ch = cleanStr(body?.ch).toLowerCase(); // whatsapp/sms/copy/system
    const cv = cleanStr(body?.cv).toUpperCase(); // A/B etc

    const hasBlockId = Boolean(requestBlockId);
    const hasClaimRef = Boolean(requestClaimRef);

    if (hasBlockId !== hasClaimRef) {
      return jsonError(400, 'CHECKOUT_LINKAGE_INCOMPLETE', {
        message: 'Availability checkout requires both blockId and claimRef.',
      });
    }

    const supabase = getServiceSupabase();
    const isAvailabilityCheckout = hasBlockId && hasClaimRef;

    let resolvedTagId = requestTagId;
    let resolvedBlockId = '';
    let resolvedAvailabilityActionId = '';
    let amount = 500;
    let currency = 'gbp';
    let productName = requestTagId ? `Support Tag ${requestTagId}` : 'Support Tag';
    let resolvedClaimRef = '';

    if (isAvailabilityCheckout) {
      const { data: action, error: actionError } = await supabase
        .from('availability_actions')
        .select('id, public_ref, block_id, tag_id, stripe_checkout_session_id, stripe_payment_intent_id, action_status, payment_status, owner_status')
        .eq('public_ref', requestClaimRef)
        .maybeSingle();

      if (actionError) {
        return jsonError(500, 'AVAILABILITY_ACTION_LOOKUP_FAILED', { message: actionError.message });
      }

      if (!action) {
        return jsonError(404, 'AVAILABILITY_ACTION_NOT_FOUND');
      }

      const { data: block, error: blockError } = await supabase
        .from('availability_blocks')
        .select('id, tag_id, title, action_type, price_pence, currency')
        .eq('id', requestBlockId)
        .maybeSingle();

      if (blockError) {
        return jsonError(500, 'AVAILABILITY_BLOCK_LOOKUP_FAILED', { message: blockError.message });
      }

      if (!block) {
        return jsonError(404, 'AVAILABILITY_BLOCK_NOT_FOUND');
      }

      const actionBlockId = cleanId((action as any).block_id);
      const actionTagId = cleanId((action as any).tag_id);
      const serverBlockId = cleanId((block as any).id);
      const serverTagId = cleanId((block as any).tag_id);

      if (actionBlockId !== serverBlockId) {
        return jsonError(400, 'ACTION_BLOCK_MISMATCH');
      }

      if (actionTagId !== serverTagId) {
        return jsonError(400, 'ACTION_TAG_MISMATCH');
      }

      if (requestTagId && requestTagId !== serverTagId) {
        return jsonError(400, 'TAG_MISMATCH');
      }

      const actionType = cleanStr((block as any).action_type).toLowerCase();
      if (actionType !== 'pay' && actionType !== 'order') {
        return jsonError(400, 'INVALID_ACTION_TYPE_FOR_CHECKOUT', { actionType });
      }

      const pricePence = Number((block as any).price_pence);
      if (!Number.isInteger(pricePence) || pricePence <= 0) {
        return jsonError(400, 'INVALID_BLOCK_PRICE');
      }

      if (cleanStr((action as any).stripe_payment_intent_id)) {
        return jsonError(409, 'ACTION_ALREADY_PAID');
      }

      if (cleanStr((action as any).stripe_checkout_session_id)) {
        return jsonError(409, 'ACTION_ALREADY_HAS_CHECKOUT');
      }

      resolvedTagId = serverTagId;
      resolvedBlockId = serverBlockId;
      resolvedAvailabilityActionId = cleanId((action as any).id);
      resolvedClaimRef = cleanStr((action as any).public_ref) || await ensurePublicRef(supabase, resolvedAvailabilityActionId);
      amount = pricePence;
      currency = normalizeCurrency((block as any).currency);
      productName = cleanStr((block as any).title) || `Support Tag ${resolvedTagId} (Block)`;
    } else {
      if (!requestTagId) {
        return jsonError(400, 'MISSING_TAG_ID', { received: Object.keys(body || {}) });
      }

      const { data: message, error: messageError } = await supabase
        .from('messages')
        .select('id, title')
        .eq('id', requestTagId)
        .maybeSingle();

      if (messageError) {
        return jsonError(500, 'TAG_LOOKUP_FAILED', { message: messageError.message });
      }

      if (!message) {
        return jsonError(404, 'TAG_NOT_FOUND');
      }

      resolvedTagId = cleanId((message as any).id);
      amount = 500;
      currency = 'gbp';
      productName = cleanStr((message as any).title) || `Support Tag ${resolvedTagId}`;
    }

    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.headers.get('origin') ||
      'https://omninethq.co.uk';

    const successUrl = new URL(`${origin}/success`);
    successUrl.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
    successUrl.searchParams.set('tag', resolvedTagId);
    if (ch) successUrl.searchParams.set('ch', ch);
    if (cv) successUrl.searchParams.set('cv', cv);

    // Helpful for UI/debugging (webhook is still the truth)
    if (resolvedBlockId) successUrl.searchParams.set('block', resolvedBlockId);
    if (resolvedClaimRef) successUrl.searchParams.set('claim', resolvedClaimRef);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      locale: 'en',
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: productName,
              metadata: {
                tagId: resolvedTagId,
                ...(resolvedBlockId ? { blockId: resolvedBlockId } : {}),
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
        tagId: resolvedTagId,
        refCode: (refCode || '').toString(),
        ch: (ch || '').toString(),
        cv: (cv || '').toString(),
        // Availability metadata for webhook confirmation.
        blockId: (resolvedBlockId || '').toString(),
        availabilityActionId: (resolvedAvailabilityActionId || '').toString(),
      },
    });

    if (isAvailabilityCheckout && resolvedAvailabilityActionId) {
      const { data: transitionResult, error: transitionError } = await supabase.rpc('transition_checkout_created', {
        p_action_id: resolvedAvailabilityActionId,
        p_stripe_checkout_session_id: session.id,
      });

      if (transitionError) {
        console.warn('availability checkout canonical update failed.', {
          actionId: resolvedAvailabilityActionId,
          error: transitionError.message,
        });
        await logOperationalEvent({
          actionId: resolvedAvailabilityActionId,
          publicRef: resolvedClaimRef,
          eventType: 'checkout_transition_failed',
          actorType: 'public',
          source: 'api/create-checkout-session',
          success: false,
          correlationId: session.id,
          payload: {
            block_id: resolvedBlockId,
            tag_id: resolvedTagId,
            stripe_checkout_session_id: session.id,
            error: transitionError.message,
            code: (transitionError as any)?.code ?? null,
          },
        });
        const code = String((transitionError as any)?.code ?? '');
        const status = code === '23514' || code === '23505' ? 409 : code === 'P0002' ? 404 : 500;
        return jsonError(status, 'AVAILABILITY_CHECKOUT_TRANSITION_FAILED', {
          message: transitionError.message,
        });
      }

      await logOperationalEvent({
        actionId: resolvedAvailabilityActionId,
        publicRef: resolvedClaimRef,
        eventType: 'checkout_created',
        actorType: 'public',
        source: 'api/create-checkout-session',
        success: true,
        correlationId: session.id,
        payload: {
          block_id: resolvedBlockId,
          tag_id: resolvedTagId,
          stripe_checkout_session_id: session.id,
          idempotent: Boolean((transitionResult as any)?.idempotent),
        },
      });
    }

    return NextResponse.json({ id: session.id, url: session.url });
  } catch (e: any) {
    return jsonError(500, 'STRIPE_CHECKOUT_ERROR', { message: e?.message ?? 'Stripe error' });
  }
}
