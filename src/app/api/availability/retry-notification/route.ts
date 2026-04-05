import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set() {},
          remove() {},
        },
      }
    );

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return json({ ok: false, error: 'Not authenticated' }, 401);
    }

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    const notificationLogId = s(body?.notificationLogId || body?.notification_log_id);
    if (!notificationLogId) {
      return json({ ok: false, error: 'Missing notificationLogId' }, 400);
    }

    const { data: logRow, error: logError } = await admin
      .from('notification_logs')
      .select('id, type, action_id, status, response, created_at')
      .eq('id', notificationLogId)
      .maybeSingle();

    if (logError) {
      return json({ ok: false, error: logError.message || 'Failed to load notification log' }, 500);
    }

    if (!logRow) {
      return json({ ok: false, error: 'Notification log not found' }, 404);
    }

    const actionId = s((logRow as any).action_id);
    if (!actionId) {
      return json({ ok: false, error: 'Notification log has no action_id' }, 400);
    }

    const { data: actionRow, error: actionError } = await admin
      .from('availability_actions')
      .select('id, block_id, tag_id')
      .eq('id', actionId)
      .maybeSingle();

    if (actionError) {
      return json({ ok: false, error: actionError.message || 'Failed to load availability action' }, 500);
    }

    if (!actionRow) {
      return json({ ok: false, error: 'Availability action not found' }, 404);
    }

    const blockId = s((actionRow as any).block_id);
    const tagId = s((actionRow as any).tag_id);

    const { data: blockRow, error: blockError } = await admin
      .from('availability_blocks')
      .select('id, tag_id, owner_id, user_id')
      .eq('id', blockId)
      .maybeSingle();

    if (blockError) {
      return json({ ok: false, error: blockError.message || 'Failed to load availability block' }, 500);
    }

    if (!blockRow) {
      return json({ ok: false, error: 'Availability block not found' }, 404);
    }

    const ownerId = s((blockRow as any).owner_id) || s((blockRow as any).user_id);
    if (!ownerId || ownerId !== user.id) {
      return json({ ok: false, error: 'You do not own this availability action' }, 403);
    }

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
          action_id: actionId,
          block_id: blockId,
          tag_id: tagId,
        },
      }),
    });

    const raw = await res.text();
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {}

    return json(
      {
        ok: res.ok,
        retried: true,
        notificationLogId,
        actionId,
        blockId,
        tagId,
        functionStatus: res.status,
        functionResponse: parsed,
      },
      res.ok ? 200 : 500
    );
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? 'Server error' }, 500);
  }
}