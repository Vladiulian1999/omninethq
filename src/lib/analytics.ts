'use client';

// Minimal browser-only logger that calls our server API.
// No env access, no Supabase import, safe for all pages to import.
export type EventName =
  | 'view_tag'
  | 'cta_impression'
  | 'cta_click'
  | 'share_click'
  | 'share_open'
  | 'checkout_start'
  | 'checkout_success'
  | 'booking_start'
  | 'booking_submitted'
  | 'booking_accepted'
    | 'availability_click'
  | 'availability_action_initiated'
  | 'availability_action_pending'
  | 'availability_action_confirmed'
  | 'availability_action_failed'

    

export async function logEvent(
  evt: EventName,
  payload: {
    tag_id?: string;
    owner_id?: string | null;
    experiment_id?: string | null;
    variant?: string | null;
    channel?: string | null;
    referrer?: string | null;
    meta?: Record<string, any>;
  } = {}
) {
  try {
    const body = JSON.stringify({ evt, payload });
    await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch (e) {
    console.warn('logEvent failed', e);
  }
}
