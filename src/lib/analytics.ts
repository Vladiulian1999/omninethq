import { createClient } from "@supabase/supabase-js";

// Browser-safe singleton client using public env vars
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type EventName =
  | "view_tag"
  | "cta_impression"
  | "cta_click"
  | "checkout_start"
  | "booking_start"
  | "booking_submitted"
  | "booking_accepted";

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
    const anon_id =
      typeof window !== "undefined"
        ? localStorage.getItem("omni_anon_id") ?? "anon"
        : "ssr";

    // Prefer the RPC if you created it:
    const { error } = await supabase.rpc("log_event", {
      p_event: evt,
      p_tag_id: payload.tag_id ?? null,
      p_owner_id: payload.owner_id ?? null,
      p_user_id: null,
      p_anon_id: anon_id,
      p_experiment_id: payload.experiment_id ?? null,
      p_variant: payload.variant ?? null,
      p_referrer:
        payload.referrer ??
        (typeof document !== "undefined" ? document.referrer : null),
      p_channel: payload.channel ?? null,
      p_meta: payload.meta ?? {},
    });

    if (error) {
      // If RPC doesn't exist yet, comment the rpc() call above and
      // switch to a direct insert into analytics_events here.
      // console.warn("logEvent RPC error:", error.message);
    }
  } catch (e) {
    console.warn("logEvent failed", e);
  }
}
