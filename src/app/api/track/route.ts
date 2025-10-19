export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

type EventName =
  | 'view_tag'
  | 'cta_impression'
  | 'cta_click'
  | 'checkout_start'
  | 'booking_start'
  | 'booking_submitted'
  | 'booking_accepted';

export async function POST(req: Request) {
  try {
    const { evt, payload } = (await req.json().catch(() => ({}))) as {
      evt?: EventName;
      payload?: Record<string, any>;
    };

    if (!evt) return new Response('Bad Request', { status: 400 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) {
      console.error('TRACK: missing Supabase envs');
      return new Response('Server not configured', { status: 500 });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // Normalize fields
    const p = payload ?? {};
    const anon_id = p.anon_id ?? null;
    const tag_id = p.tag_id ?? null;
    const owner_id = p.owner_id ?? null;
    const user_id = p.user_id ?? null;
    const experiment_id = p.experiment_id ?? null;
    const variant = p.variant ?? null;
    const referrer = p.referrer ?? null;
    const channel = p.channel ?? null;
    const meta = p.meta ?? {};

    // Prefer RPC if you created it; fall back to direct insert
    const tryRpc = await supabase.rpc('log_event', {
      p_event: evt,
      p_tag_id: tag_id,
      p_owner_id: owner_id,
      p_user_id: user_id,
      p_anon_id: anon_id,
      p_experiment_id: experiment_id,
      p_variant: variant,
      p_referrer: referrer,
      p_channel: channel,
      p_meta: meta,
    });

    if (tryRpc.error) {
      // RPC missing? Do a direct insert.
      const ins = await supabase.from('analytics_events').insert([
        {
          event: evt,
          tag_id,
          owner_id,
          user_id,
          anon_id,
          experiment_id,
          variant,
          referrer,
          channel,
          meta,
        },
      ]);
      if (ins.error) {
        console.error('TRACK insert error', ins.error);
        return new Response('Failed to log', { status: 500 });
      }
    }

    return new Response(null, { status: 204 });
  } catch (e) {
    console.error('TRACK fatal', e);
    return new Response('Server error', { status: 500 });
  }
}
