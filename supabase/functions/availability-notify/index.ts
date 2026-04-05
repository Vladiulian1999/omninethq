// Edge Function: availability-notify
// Sends owner email notifications when an availability claim is created.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Payload = {
  type?: 'CLAIM' | 'PING' | string;
  record?: Record<string, unknown>;
};

type TagKV = { name: string; value: string };

const FROM = 'OmniNet <notify@omninethq.co.uk>';
const RESEND_URL = 'https://api.resend.com/emails';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

function htmlEscape(str: string) {
  return str.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]!)
  );
}

function normalizeApiKey(k?: string) {
  const raw = (k ?? '').replace(/^\uFEFF/, '').trim();
  const unquoted = raw.replace(/^['"]|['"]$/g, '');
  return unquoted.replace(/^Bearer\s+/i, '');
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fmtDate(iso?: string | null) {
  try {
    if (!iso) return 'Always available';
    return new Date(iso).toLocaleString('en-GB');
  } catch {
    return String(iso ?? '');
  }
}

function fmtWindow(startAt?: string | null, endAt?: string | null) {
  if (!startAt && !endAt) return 'Always available';
  const start = fmtDate(startAt);
  const end = fmtDate(endAt);
  if (startAt && endAt) return `${start} → ${end}`;
  return startAt ? start : end;
}

function buildTags(ownerId?: string, tagId?: string, blockId?: string, actionId?: string): TagKV[] {
  const tags: TagKV[] = [{ name: 'type', value: 'availability' }];
  if (ownerId) tags.push({ name: 'owner', value: ownerId.replace(/[^A-Za-z0-9_-]/g, '-') });
  if (tagId) tags.push({ name: 'tag', value: tagId.replace(/[^A-Za-z0-9_-]/g, '-') });
  if (blockId) tags.push({ name: 'block', value: blockId.replace(/[^A-Za-z0-9_-]/g, '-') });
  if (actionId) tags.push({ name: 'action', value: actionId.replace(/[^A-Za-z0-9_-]/g, '-') });
  return tags;
}

async function sendEmail({
  apiKey,
  to,
  subject,
  html,
  text,
  idempotencyKey,
  tags,
}: {
  apiKey: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
  tags?: TagKV[];
}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const body: Record<string, unknown> = {
    from: FROM,
    to,
    subject,
    html,
    text,
  };

  if (tags?.length) body.tags = tags;

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const textBody = await res.text();
  console.log('Resend status:', res.status);
  console.log('Resend body:', textBody);

  return {
    ok: res.ok,
    status: res.status,
    body: textBody,
  };
}

async function logNotification(
  sb: ReturnType<typeof createClient>,
  params: {
    type: string;
    actionId?: string | null;
    status: string;
    response: Record<string, unknown>;
  }
) {
  const payload = {
    type: params.type,
    action_id: params.actionId || null,
    status: params.status,
    response: params.response,
  };

  const { error } = await sb.from('notification_logs').insert(payload);

  if (error) {
    console.error('notification_logs insert failed:', error);
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RAW_RESEND = Deno.env.get('RESEND_API_KEY') || '';
    const RESEND_API_KEY = normalizeApiKey(RAW_RESEND);
    const EDGE_SUPABASE_URL = Deno.env.get('EDGE_SUPABASE_URL') || '';
    const EDGE_SERVICE_ROLE_KEY = Deno.env.get('EDGE_SERVICE_ROLE_KEY') || '';

    const fp = await sha256Hex(RESEND_API_KEY);
    console.log(
      'ENV check:',
      'RESEND',
      RESEND_API_KEY.startsWith('re_'),
      'len:',
      RESEND_API_KEY.length,
      'fp:',
      fp.slice(0, 8),
      '| EDGE_URL',
      !!EDGE_SUPABASE_URL,
      '| EDGE_SR',
      EDGE_SERVICE_ROLE_KEY.length > 20
    );

    if (!RESEND_API_KEY) {
      return json({ ok: false, error: 'Missing RESEND_API_KEY' }, 500);
    }

    if (!EDGE_SUPABASE_URL || !EDGE_SERVICE_ROLE_KEY) {
      return json({ ok: false, error: 'Missing edge Supabase env vars' }, 500);
    }

    const payload = (await req.json()) as Payload;
    const type = s(payload?.type);
    const record = (payload?.record ?? {}) as Record<string, unknown>;

    if (type === 'PING') {
      return json({ ok: true, pong: record }, 200);
    }

    if (type !== 'CLAIM') {
      return json({ ok: true, ignored: true, type }, 200);
    }

    const actionId = s(record.action_id);
    const blockId = s(record.block_id);
    const tagIdFromPayload = s(record.tag_id);

    if (!actionId || !blockId) {
      return json({ ok: false, error: 'Missing action_id or block_id' }, 400);
    }

    const sb = createClient(EDGE_SUPABASE_URL, EDGE_SERVICE_ROLE_KEY);

    const { data: actionRow, error: actionError } = await sb
      .from('availability_actions')
      .select('*')
      .eq('id', actionId)
      .maybeSingle();

    if (actionError) {
      await logNotification(sb, {
        type: 'availability_claim',
        actionId,
        status: 'failed',
        response: {
          stage: 'load_action',
          error: actionError.message,
          blockId,
          tagId: tagIdFromPayload,
        },
      });

      return json({ ok: false, error: actionError.message }, 500);
    }

    if (!actionRow) {
      await logNotification(sb, {
        type: 'availability_claim',
        actionId,
        status: 'failed',
        response: {
          stage: 'load_action',
          error: 'Availability action not found',
          blockId,
          tagId: tagIdFromPayload,
        },
      });

      return json({ ok: false, error: 'Availability action not found' }, 404);
    }

    const { data: blockRow, error: blockError } = await sb
      .from('availability_blocks')
      .select('*')
      .eq('id', blockId)
      .maybeSingle();

    if (blockError) {
      await logNotification(sb, {
        type: 'availability_claim',
        actionId,
        status: 'failed',
        response: {
          stage: 'load_block',
          error: blockError.message,
          blockId,
          tagId: tagIdFromPayload,
        },
      });

      return json({ ok: false, error: blockError.message }, 500);
    }

    if (!blockRow) {
      await logNotification(sb, {
        type: 'availability_claim',
        actionId,
        status: 'failed',
        response: {
          stage: 'load_block',
          error: 'Availability block not found',
          blockId,
          tagId: tagIdFromPayload,
        },
      });

      return json({ ok: false, error: 'Availability block not found' }, 404);
    }

    const ownerId = s((blockRow as any).owner_id) || s((blockRow as any).user_id);
    const tagId = s((blockRow as any).tag_id) || tagIdFromPayload;
    const blockTitle = s((blockRow as any).title) || 'Availability claim';
    const actionType = s((blockRow as any).action_type) || 'reserve';
    const startAt = s((blockRow as any).start_at) || null;
    const endAt = s((blockRow as any).end_at) || null;

    let ownerEmail = '';

    if (ownerId) {
      const { data: ownerResp, error: ownerErr } = await sb.auth.admin.getUserById(ownerId);
      if (ownerErr) {
        console.warn('owner lookup failed:', ownerErr);

        await logNotification(sb, {
          type: 'availability_claim',
          actionId,
          status: 'failed',
          response: {
            stage: 'owner_lookup',
            error: ownerErr.message,
            ownerId,
            blockId,
            tagId,
          },
        });

        return json({ ok: false, error: ownerErr.message }, 500);
      }

      ownerEmail = s(ownerResp?.user?.email);
    }

    if (!ownerEmail) {
      await logNotification(sb, {
        type: 'availability_claim',
        actionId,
        status: 'failed',
        response: {
          stage: 'owner_email',
          error: 'Owner email not found',
          ownerId,
          blockId,
          tagId,
        },
      });

      return json({ ok: false, error: 'Owner email not found', ownerId, tagId, blockId }, 404);
    }

    const customerName = s((actionRow as any).customer_name) || '(no name)';
    const customerContact = s((actionRow as any).customer_contact) || '(no contact)';
    const quantity = Number((actionRow as any).quantity ?? 1);
    const channel = s((actionRow as any).channel) || 'unknown';
    const referralCode = s((actionRow as any).referral_code);
    const createdAt = s((actionRow as any).created_at);

    const ownerLink = `https://omninethq.co.uk/tag/${encodeURIComponent(tagId)}/availability`;

    await logNotification(sb, {
      type: 'availability_claim',
      actionId,
      status: 'attempted',
      response: {
        stage: 'before_send',
        ownerId,
        ownerEmail,
        blockId,
        tagId,
        actionType,
      },
    });

    const subject =
      actionType === 'reserve'
        ? '⚡ New reserve claim on your tag'
        : actionType === 'book'
          ? '⚡ New booking claim on your availability'
          : '⚡ New availability action on your tag';

    const html = `
      <h2>New availability claim</h2>
      <p><b>Block:</b> ${htmlEscape(blockTitle)}</p>
      <p><b>Action type:</b> ${htmlEscape(actionType)}</p>
      <p><b>When:</b> ${htmlEscape(fmtWindow(startAt, endAt))}</p>
      <p><b>Quantity:</b> ${htmlEscape(String(quantity || 1))}</p>
      <p><b>Customer:</b> ${htmlEscape(customerName)}</p>
      <p><b>Contact:</b> ${htmlEscape(customerContact)}</p>
      <p><b>Channel:</b> ${htmlEscape(channel)}</p>
      ${referralCode ? `<p><b>Referral:</b> ${htmlEscape(referralCode)}</p>` : ''}
      ${createdAt ? `<p><b>Claimed at:</b> ${htmlEscape(fmtDate(createdAt))}</p>` : ''}
      <p><b>Action ID:</b> ${htmlEscape(actionId)}</p>
      <div style="margin:20px 0;">
        <a href="${ownerLink}" style="background:#111827;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">
          Open availability dashboard
        </a>
      </div>
      <p>Direct link: <a href="${ownerLink}" target="_blank">${ownerLink}</a></p>
    `;

    const text =
      `New availability claim\n` +
      `Block: ${blockTitle}\n` +
      `Action type: ${actionType}\n` +
      `When: ${fmtWindow(startAt, endAt)}\n` +
      `Quantity: ${quantity || 1}\n` +
      `Customer: ${customerName}\n` +
      `Contact: ${customerContact}\n` +
      `Channel: ${channel}\n` +
      (referralCode ? `Referral: ${referralCode}\n` : '') +
      (createdAt ? `Claimed at: ${fmtDate(createdAt)}\n` : '') +
      `Action ID: ${actionId}\n` +
      `Open: ${ownerLink}\n`;

    const resend = await sendEmail({
      apiKey: RESEND_API_KEY,
      to: ownerEmail,
      subject,
      html,
      text,
      idempotencyKey: `availability-claim-${actionId}`,
      tags: buildTags(ownerId, tagId, blockId, actionId),
    });

    if (!resend.ok) {
      await logNotification(sb, {
        type: 'availability_claim',
        actionId,
        status: 'failed',
        response: {
          stage: 'resend_send',
          resend_status: resend.status,
          resend_body: resend.body,
          ownerEmail,
          ownerId,
          blockId,
          tagId,
        },
      });

      return json(
        {
          ok: false,
          error: 'RESEND_FAILED',
          resend_status: resend.status,
          resend_body: resend.body,
          ownerEmail,
          actionId,
          blockId,
          tagId,
        },
        500
      );
    }

    await logNotification(sb, {
      type: 'availability_claim',
      actionId,
      status: 'sent',
      response: {
        stage: 'resend_send',
        resend_status: resend.status,
        resend_body: resend.body,
        ownerEmail,
        ownerId,
        blockId,
        tagId,
      },
    });

    return json(
      {
        ok: true,
        ownerEmail,
        actionId,
        blockId,
        tagId,
      },
      200
    );
  } catch (err) {
    console.error('availability-notify error:', err);

    const EDGE_SUPABASE_URL = Deno.env.get('EDGE_SUPABASE_URL') || '';
    const EDGE_SERVICE_ROLE_KEY = Deno.env.get('EDGE_SERVICE_ROLE_KEY') || '';

    if (EDGE_SUPABASE_URL && EDGE_SERVICE_ROLE_KEY) {
      try {
        const sb = createClient(EDGE_SUPABASE_URL, EDGE_SERVICE_ROLE_KEY);
        await logNotification(sb, {
          type: 'availability_claim',
          actionId: null,
          status: 'failed',
          response: {
            stage: 'catch',
            error: String(err),
          },
        });
      } catch (logErr) {
        console.error('catch-path notification log failed:', logErr);
      }
    }

    return json({ ok: false, error: String(err) }, 500);
  }
});