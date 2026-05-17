import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logOperationalEvent } from '@/lib/operationalEvents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type WorkflowTransition = 'acknowledge' | 'contact' | 'close';

function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE(_KEY) is missing');

  return createClient(url, key, { auth: { persistSession: false } });
}

function transitionFromBody(v: unknown): WorkflowTransition | null {
  const transition = s(v).toLowerCase();
  if (transition === 'acknowledge' || transition === 'contact' || transition === 'close') {
    return transition;
  }
  return null;
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

    const actionId = s(body?.actionId || body?.action_id);
    const transition = transitionFromBody(body?.transition);

    if (!actionId) {
      return json({ ok: false, error: 'Missing actionId' }, 400);
    }

    if (!transition) {
      return json({ ok: false, error: 'Invalid transition' }, 400);
    }

    const admin = getAdminClient();

    const { data: actionRow, error: actionError } = await admin
      .from('availability_actions')
      .select('id, block_id, tag_id, meta, owner_status')
      .eq('id', actionId)
      .maybeSingle();

    if (actionError) {
      return json({ ok: false, error: actionError.message || 'Failed to load availability action' }, 500);
    }

    if (!actionRow) {
      return json({ ok: false, error: 'Availability action not found' }, 404);
    }

    const blockId = s((actionRow as any).block_id);
    if (!blockId) {
      return json({ ok: false, error: 'Availability action has no block_id' }, 400);
    }

    const { data: blockRow, error: blockError } = await admin
      .from('availability_blocks')
      .select('id, owner_id')
      .eq('id', blockId)
      .maybeSingle();

    if (blockError) {
      return json({ ok: false, error: blockError.message || 'Failed to load availability block' }, 500);
    }

    if (!blockRow) {
      return json({ ok: false, error: 'Availability block not found' }, 404);
    }

    const ownerId = s((blockRow as any).owner_id);
    if (!ownerId || ownerId !== user.id) {
      return json({ ok: false, error: 'You do not own this availability action' }, 403);
    }

    const rpcName =
      transition === 'acknowledge'
        ? 'transition_owner_acknowledged'
        : transition === 'contact'
          ? 'transition_owner_contacted'
          : 'transition_owner_closed';

    const { data: transitionResult, error: transitionError } = await admin.rpc(rpcName, {
      p_action_id: actionId,
      p_owner_id: user.id,
    });

    if (transitionError) {
      const msg = transitionError.message || 'Failed to update claim workflow';
      const code = String((transitionError as any)?.code ?? '');
      const status = code === '42501' ? 403 : code === 'P0002' ? 404 : code === '23514' ? 409 : 500;
      await logOperationalEvent({
        actionId,
        eventType: 'owner_transition_failed',
        actorType: 'owner',
        actorId: user.id,
        source: 'api/availability/action-workflow',
        success: false,
        payload: {
          transition,
          block_id: blockId,
          tag_id: s((actionRow as any).tag_id),
          error: msg,
          code,
        },
      });
      return json({ ok: false, error: msg }, status);
    }

    const eventType =
      transition === 'acknowledge'
        ? 'owner_acknowledged'
        : transition === 'contact'
          ? 'owner_contacted'
          : 'owner_closed';

    await logOperationalEvent({
      actionId,
      publicRef: (transitionResult as any)?.action?.public_ref ?? null,
      eventType,
      actorType: 'owner',
      actorId: user.id,
      source: 'api/availability/action-workflow',
      success: true,
      payload: {
        transition,
        block_id: blockId,
        tag_id: s((actionRow as any).tag_id),
        idempotent: Boolean((transitionResult as any)?.idempotent),
      },
    });

    return json({ ok: true, result: transitionResult });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? 'Server error' }, 500);
  }
}
