import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logOperationalEvent } from '@/lib/operationalEvents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function serverConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
  if (!anon) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing');
  if (!service) throw new Error('SUPABASE_SERVICE_ROLE(_KEY) is missing');

  return { url, anon, service };
}

export async function POST(req: NextRequest) {
  try {
    const config = serverConfig();
    const cookieStore = await cookies();

    const supabase = createServerClient(
      config.url,
      config.anon,
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
      config.url,
      config.service,
      { auth: { persistSession: false } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.warn('[availability retry-notification] unauthenticated request', {
        userError: userError?.message ?? null,
      });
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
      console.warn('[availability retry-notification] missing notificationLogId');
      return json({ ok: false, error: 'Missing notificationLogId' }, 400);
    }

    const { data: logRow, error: logError } = await admin
      .from('notification_logs')
      .select('id, type, action_id, status, response, created_at')
      .eq('id', notificationLogId)
      .maybeSingle();

    if (logError) {
      console.error('[availability retry-notification] notification log lookup failed', {
        notificationLogId,
        error: logError.message,
      });
      return json({ ok: false, error: logError.message || 'Failed to load notification log' }, 500);
    }

    if (!logRow) {
      console.warn('[availability retry-notification] notification log not found', { notificationLogId });
      return json({ ok: false, error: 'Notification log not found' }, 404);
    }

    const actionId = s((logRow as any).action_id);
    if (!actionId) {
      console.warn('[availability retry-notification] notification log has no action_id', { notificationLogId });
      return json({ ok: false, error: 'Notification log has no action_id' }, 400);
    }

    const { data: actionRow, error: actionError } = await admin
      .from('availability_actions')
      .select('id, block_id, tag_id')
      .eq('id', actionId)
      .maybeSingle();

    if (actionError) {
      console.error('[availability retry-notification] action lookup failed', {
        notificationLogId,
        actionId,
        error: actionError.message,
      });
      return json({ ok: false, error: actionError.message || 'Failed to load availability action' }, 500);
    }

    if (!actionRow) {
      console.warn('[availability retry-notification] action not found', { notificationLogId, actionId });
      return json({ ok: false, error: 'Availability action not found' }, 404);
    }

    const blockId = s((actionRow as any).block_id);
    const tagId = s((actionRow as any).tag_id);
    if (!blockId) {
      console.warn('[availability retry-notification] action missing block_id', {
        notificationLogId,
        actionId,
        tagId,
      });
      return json({ ok: false, error: 'Availability action has no block_id' }, 400);
    }

    const { data: blockRow, error: blockError } = await admin
      .from('availability_blocks')
      .select('id, tag_id, owner_id')
      .eq('id', blockId)
      .maybeSingle();

    if (blockError) {
      console.error('[availability retry-notification] block lookup failed', {
        notificationLogId,
        actionId,
        blockId,
        error: blockError.message,
      });
      return json({ ok: false, error: blockError.message || 'Failed to load availability block' }, 500);
    }

    if (!blockRow) {
      console.warn('[availability retry-notification] block not found', {
        notificationLogId,
        actionId,
        blockId,
      });
      return json({ ok: false, error: 'Availability block not found' }, 404);
    }

    const ownerId = s((blockRow as any).owner_id);
    if (!ownerId || ownerId !== user.id) {
      console.warn('[availability retry-notification] ownership denied', {
        notificationLogId,
        actionId,
        blockId,
        ownerId: ownerId || null,
        userId: user.id,
      });
      return json({ ok: false, error: 'You do not own this availability action' }, 403);
    }

    const fnUrl = `${config.url}/functions/v1/availability-notify`;

    await logOperationalEvent({
      actionId,
      eventType: 'notification_retry_requested',
      actorType: 'owner',
      actorId: user.id,
      source: 'api/availability/retry-notification',
      success: true,
      correlationId: notificationLogId,
      payload: {
        notification_log_id: notificationLogId,
        block_id: blockId,
        tag_id: tagId,
      },
    });

    let res: Response;
    try {
      res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.anon}`,
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
    } catch (e: any) {
      console.error('[availability retry-notification] availability-notify fetch failed', {
        notificationLogId,
        actionId,
        blockId,
        tagId,
        error: e?.message ?? String(e),
      });
      await logOperationalEvent({
        actionId,
        eventType: 'notification_retry_failed',
        actorType: 'owner',
        actorId: user.id,
        source: 'api/availability/retry-notification',
        success: false,
        correlationId: notificationLogId,
        payload: {
          notification_log_id: notificationLogId,
          block_id: blockId,
          tag_id: tagId,
          stage: 'fetch',
          error: e?.message ?? String(e),
        },
      });
      return json(
        {
          ok: false,
          retried: true,
          error: 'AVAILABILITY_NOTIFY_FETCH_FAILED',
          message: e?.message ?? 'Could not invoke availability notification function.',
          notificationLogId,
          actionId,
          blockId,
          tagId,
        },
        502
      );
    }

    const raw = await res.text();
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {}

    const responseBody = {
      ok: res.ok,
      retried: true,
      notificationLogId,
      actionId,
      blockId,
      tagId,
      functionStatus: res.status,
      functionResponse: parsed,
    };

    if (!res.ok) {
      console.warn('[availability retry-notification] availability-notify returned failure', responseBody);
      const functionError =
        parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as any).error)
          : typeof parsed === 'string'
            ? parsed.slice(0, 200)
            : 'availability-notify failed';

      await logOperationalEvent({
        actionId,
        eventType: 'notification_retry_failed',
        actorType: 'owner',
        actorId: user.id,
        source: 'api/availability/retry-notification',
        success: false,
        correlationId: notificationLogId,
        payload: {
          notification_log_id: notificationLogId,
          block_id: blockId,
          tag_id: tagId,
          stage: 'edge_function',
          function_status: res.status,
          function_error: functionError,
        },
      });
      return json(
        {
          ...responseBody,
          error: 'AVAILABILITY_NOTIFY_FAILED',
        },
        502
      );
    }

    await logOperationalEvent({
      actionId,
      eventType: 'notification_retry_succeeded',
      actorType: 'owner',
      actorId: user.id,
      source: 'api/availability/retry-notification',
      success: true,
      correlationId: notificationLogId,
      payload: {
        notification_log_id: notificationLogId,
        block_id: blockId,
        tag_id: tagId,
        function_status: res.status,
      },
    });

    return json(responseBody, 200);
  } catch (e: any) {
    console.error('[availability retry-notification] unhandled error', {
      error: e?.message ?? String(e),
    });
    return json({ ok: false, error: e?.message ?? 'Server error' }, 500);
  }
}
