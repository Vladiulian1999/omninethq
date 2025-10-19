'use client';

// Minimal browser-only logger that calls our server API.
// No env access, no Supabase import, safe for all pages to import.
export type EventName =
  | 'view_tag'
  | 'cta_impression'
  | 'cta_click'
  | 'checkout_start'
  | 'booking_start'
  | 'booking_submitted'
  | 'booking_accepted';

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
    // include anon_id on the client if you want; server will fill anything missing
    const body = JSON.stringify({ evt, payload });
    await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true, // survives page unload
    });
  } catch (e) {
    // Never throw from analytics
    console.warn('logEvent failed', e);
  }
}
