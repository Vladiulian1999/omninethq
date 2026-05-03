import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cleanStr(v: any) {
  return (v ?? '').toString().trim();
}

function cleanId(v: any) {
  return cleanStr(v).replace(/[<>\s]/g, '');
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE(_KEY) is missing');

  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizeQuantity(v: any) {
  const n = Number(v ?? 1);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function normalizeMeta(v: any) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

async function invokeAvailabilityNotify(params: {
  actionId: string;
  blockId: string;
  tagId: string;
}) {
  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL!}/functions/v1/availability-notify`;

  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
    },
    body: JSON.stringify({
      type: 'CLAIM',
      record: {
        action_id: params.actionId,
        block_id: params.blockId,
        tag_id: params.tagId,
      },
    }),
  });

  const raw = await res.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {}

  return {
    attempted: true,
    ok: res.ok,
    status: res.status,
    response: parsed,
  };
}

export async function POST(req: NextRequest) {
  let body: any = null;

  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  try {
    const blockId =
      cleanId(body?.blockId) ||
      cleanId(body?.block_id) ||
      cleanId(body?.availabilityBlockId);
    const idempotencyKey =
      cleanStr(body?.idempotencyKey) ||
      cleanStr(body?.idempotency_key);

    if (!blockId) {
      return json({ ok: false, error: 'Missing blockId' }, 400);
    }

    if (!idempotencyKey) {
      return json({ ok: false, error: 'Missing idempotencyKey' }, 400);
    }

    const quantity = normalizeQuantity(body?.quantity);
    const customerName = cleanStr(body?.customerName ?? body?.customer_name) || null;
    const customerContact = cleanStr(body?.customerContact ?? body?.customer_contact) || null;
    const referralCode = cleanStr(body?.referralCode ?? body?.referral_code) || null;
    const channel = cleanStr(body?.channel) || 'qr';
    const meta = normalizeMeta(body?.meta);

    const supabase = getServiceSupabase();

    const { data: rpcData, error: rpcError } = await supabase.rpc('claim_availability_block', {
      p_block_id: blockId,
      p_idempotency_key: idempotencyKey,
      p_quantity: quantity,
      p_customer_name: customerName,
      p_customer_contact: customerContact,
      p_channel: channel,
      p_referral_code: referralCode,
      p_meta: meta,
    });

    if (rpcError) {
      const msg = (rpcError.message || '').toLowerCase();
      const status = msg.includes('availability block not found') ? 404 : 500;
      return json(
        {
          ok: false,
          error: rpcError.message || 'Failed to claim availability.',
          postgres: {
            code: (rpcError as any)?.code,
            details: (rpcError as any)?.details,
            hint: (rpcError as any)?.hint,
          },
        },
        status
      );
    }

    const claim = Array.isArray(rpcData) ? (rpcData as any[])[0] : rpcData;
    const actionId = cleanId((claim as any)?.action_id);

    if (!actionId) {
      return json({ ok: false, error: 'Claim failed (no action_id returned).' }, 500);
    }

    const { data: block, error: blockError } = await supabase
      .from('availability_blocks')
      .select('id, tag_id')
      .eq('id', blockId)
      .maybeSingle();

    if (blockError || !block) {
      return json({
        ok: true,
        claim,
        notification: {
          attempted: false,
          ok: false,
          error: blockError?.message || 'Availability block not found for notification.',
        },
      });
    }

    const canonicalBlockId = cleanId((block as any).id) || blockId;
    const tagId = cleanId((block as any).tag_id);

    if (!tagId) {
      return json({
        ok: true,
        claim,
        notification: {
          attempted: false,
          ok: false,
          error: 'Availability block has no tag_id for notification.',
        },
      });
    }

    let notification:
      | Awaited<ReturnType<typeof invokeAvailabilityNotify>>
      | { attempted: true; ok: false; error: string };

    try {
      notification = await invokeAvailabilityNotify({
        actionId,
        blockId: canonicalBlockId,
        tagId,
      });
    } catch (e: any) {
      notification = {
        attempted: true,
        ok: false,
        error: e?.message ?? 'availability-notify invocation failed',
      };
    }

    return json({
      ok: true,
      claim,
      notification,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? 'Server error' }, 500);
  }
}
