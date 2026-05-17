import { createClient } from '@supabase/supabase-js';

type OperationalEventInput = {
  actionId?: string | null;
  publicRef?: string | null;
  eventType: string;
  actorType?: string | null;
  actorId?: string | null;
  source?: string | null;
  success?: boolean;
  correlationId?: string | null;
  payload?: Record<string, unknown> | null;
};

const SENSITIVE_KEY_PARTS = [
  'api_key',
  'apikey',
  'authorization',
  'bearer',
  'contact',
  'customer_contact',
  'email',
  'owneremail',
  'payment_intent',
  'raw',
  'secret',
  'stripe_payment_intent',
  'token',
];

function cleanStr(v: unknown) {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

function asUuid(v: unknown) {
  const text = cleanStr(v);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function isSensitiveKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const snake = key.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part.replace(/_/g, '')) || snake.includes(part));
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    result[key] = isSensitiveKey(key) ? '[redacted]' : redact(nested);
  }
  return result;
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function logOperationalEvent(input: OperationalEventInput) {
  try {
    const eventType = cleanStr(input.eventType);
    if (!eventType) return;

    const supabase = getAdminClient();
    if (!supabase) {
      console.warn('[operational_events] missing service config');
      return;
    }

    const { error } = await supabase.from('operational_events').insert({
      action_id: asUuid(input.actionId),
      public_ref: cleanStr(input.publicRef) || null,
      event_type: eventType,
      actor_type: cleanStr(input.actorType) || null,
      actor_id: asUuid(input.actorId),
      source: cleanStr(input.source) || null,
      success: input.success !== false,
      correlation_id: cleanStr(input.correlationId) || null,
      payload: (redact(input.payload ?? {}) as Record<string, unknown>) ?? {},
    });

    if (error) {
      console.warn('[operational_events] insert failed:', error.message);
    }
  } catch (e: any) {
    console.warn('[operational_events] logger failed:', e?.message ?? e);
  }
}
