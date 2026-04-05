'use client';

import { useEffect, useRef, useState, useMemo, type FormEvent } from 'react';
import QRCode from 'react-qr-code';
import { toPng } from 'html-to-image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ScanAnalytics from '@/components/ScanAnalytics';
import { BackButton } from '@/components/BackButton';
import toast, { Toaster } from 'react-hot-toast';
import OwnerBookingToggle from '@/components/OwnerBookingToggle';
import BookingRequestForm from '@/components/BookingRequestForm';
import BookingRequestsList from '@/components/BookingRequestsList';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { logEvent } from '@/lib/analytics';
import AvailabilityPublicSection, { type AvailabilityBlockRow } from '@/components/AvailabilityPublicSection';

type FeedbackEntry = {
  id: string;
  tag_id: string;
  name: string;
  message: string;
  rating: number;
  created_at: string;
  hidden?: boolean;
};

type Props = {
  tagId: string;
  scanChartData: { date: string; count: number }[];
};

type ClaimConfirmationState = {
  actionId: string;
  blockId: string;
  actionType: string;
  title: string | null;
  startAt: string | null;
  endAt: string | null;
  quantity: number;
};

/* =========================
   A/B experiment + analytics
   ========================= */
const EXP_ID = 'cta_main_v1';
const VARIANTS = ['A', 'B'] as const;

// Share-copy experiment
const SHARE_COPY_EXP_ID = 'share_copy_v1';
const SHARE_COPY_VARIANTS = ['A', 'B'] as const;

function getAnonId(): string {
  try {
    const k = 'omni_anon_id';
    let id = localStorage.getItem(k);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(k, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

function hashFNV(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

function assignVariant(experimentId: string, key: string, variants = VARIANTS) {
  const anon = getAnonId();
  const idx = hashFNV(`${experimentId}:${key}:${anon}`) % variants.length;
  return variants[idx];
}

type ShareChannel = 'whatsapp' | 'sms' | 'copy' | 'system';

function normalizeWinnerChannel(ch: string | null | undefined): ShareChannel | null {
  const v = (ch || '').toLowerCase().trim();
  if (!v) return null;
  if (v === 'share') return 'system';
  if (v === 'system') return 'system';
  if (v === 'whatsapp') return 'whatsapp';
  if (v === 'sms') return 'sms';
  if (v === 'copy') return 'copy';
  if (v === 'direct') return null;
  return null;
}

function labelForChannel(ch: ShareChannel) {
  if (ch === 'system') return 'Share';
  if (ch === 'whatsapp') return 'WhatsApp';
  if (ch === 'sms') return 'SMS';
  return 'Copy';
}

/**
 * Shared URL builder with channel + copy variant (cv)
 * rid is optional referral_code if present
 */
function buildShareUrl(baseUrl: string, channel: ShareChannel, cv?: string | null) {
  const url = new URL(baseUrl);
  url.searchParams.set('ch', channel);
  if (cv) url.searchParams.set('cv', cv);
  const rid = localStorage.getItem('referral_code');
  if (rid) url.searchParams.set('rid', rid);
  return url.toString();
}

function getQueryParam(name: string) {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || null;
  } catch {
    return null;
  }
}

/** Store last attribution per tag so later events can include it */
function setLastAttribution(tagId: string, data: { ch?: string | null; cv?: string | null }) {
  try {
    const key = `omni_attr_${tagId}`;
    localStorage.setItem(key, JSON.stringify({ ...data, at: Date.now() }));
  } catch {}
}
function getLastAttribution(tagId: string): { ch?: string | null; cv?: string | null } | null {
  try {
    const key = `omni_attr_${tagId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Message templates per channel + variant */
function buildShareMessage(opts: { title: string; url: string; channel: ShareChannel; variant: 'A' | 'B' }) {
  const { title, url, channel } = opts;

  if (channel === 'whatsapp') {
    return `Tag link:
${title}
${url}`;
  }

  if (channel === 'sms') {
    return `Tag link: ${title} ${url}`;
  }

  if (channel === 'copy') {
    return `Tag link:
${title}
${url}`;
  }

  return `Tag link: ${title}`;
}

function claimConfirmationStorageKey(tagId: string) {
  return `omni_claim_confirmation_${tagId}`;
}

function claimConfirmationTtlMs(actionType: string) {
  const type = String(actionType || '').trim().toLowerCase();
  if (type === 'pay' || type === 'order') return 60 * 60 * 1000;
  return 6 * 60 * 60 * 1000;
}

function saveClaimConfirmation(tagId: string, value: ClaimConfirmationState | null) {
  try {
    const key = claimConfirmationStorageKey(tagId);
    if (!value) {
      sessionStorage.removeItem(key);
      return;
    }

    const savedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + claimConfirmationTtlMs(value.actionType)).toISOString();

    sessionStorage.setItem(
      key,
      JSON.stringify({
        ...value,
        savedAt,
        expiresAt,
      })
    );
  } catch {}
}

function loadClaimConfirmation(tagId: string): ClaimConfirmationState | null {
  try {
    const key = claimConfirmationStorageKey(tagId);
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      sessionStorage.removeItem(key);
      return null;
    }

    const actionId = String(parsed.actionId ?? '').trim();
    const blockId = String(parsed.blockId ?? '').trim();
    const actionType = String(parsed.actionType ?? '').trim();

    if (!actionId || !blockId || !actionType) {
      sessionStorage.removeItem(key);
      return null;
    }

    const expiresAtRaw = String(parsed.expiresAt ?? '').trim();
    if (expiresAtRaw) {
      const expiresAtMs = new Date(expiresAtRaw).getTime();
      if (Number.isFinite(expiresAtMs) && Date.now() > expiresAtMs) {
        sessionStorage.removeItem(key);
        return null;
      }
    }

    return {
      actionId,
      blockId,
      actionType,
      title: parsed.title ?? null,
      startAt: parsed.startAt ?? null,
      endAt: parsed.endAt ?? null,
      quantity: Number(parsed.quantity ?? 1) || 1,
    };
  } catch {
    try {
      sessionStorage.removeItem(claimConfirmationStorageKey(tagId));
    } catch {}
    return null;
  }
}

/** A2HS prompt nudge */
function A2HSNudge() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('a2hs_seen')) return;

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    localStorage.setItem('a2hs_seen', '1');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 z-50 bg-white border shadow-lg rounded-2xl p-4 flex items-center justify-between">
      <span className="text-sm">Add OmniNet to your home screen for 1-tap access.</span>
      <div className="flex gap-2">
        <button className="px-3 py-1 border rounded-xl" onClick={() => setShow(false)}>
          Not now
        </button>
        <button className="px-3 py-1 border rounded-xl" onClick={install}>
          Add
        </button>
      </div>
    </div>
  );
}

/** Processes ?action=accept|decline&booking=<id> when an owner arrives from email */
function EmailActionProcessor({ cleanId, ownerId }: { cleanId: string; ownerId?: string | null }) {
  const router = useRouter();
  const sp = useSearchParams();
  const processed = useRef(false);
  const supabase = useMemo(() => getSupabaseBrowser(), []);

  useEffect(() => {
    const action = sp.get('action');
    const bookingId = sp.get('booking');
    if (!action || !bookingId) return;
    if (processed.current) return;
    if (!ownerId) return;
    processed.current = true;

    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) {
          toast.error('Please log in to manage bookings.');
          return;
        }
        if (userId !== ownerId) {
          toast.error("You don't have permission to manage this booking.");
          return;
        }

        const { data: booking } = await supabase.from('bookings').select('id, status, tag_id').eq('id', bookingId).single();

        if (!booking || booking.tag_id !== cleanId) {
          toast.error('Booking not found or invalid.');
          return;
        }

        const nextStatus = action === 'accept' ? 'accepted' : 'declined';
        if (booking.status === nextStatus) {
          toast('This booking is already ' + nextStatus + '.');
          return;
        }

        await supabase.from('bookings').update({ status: nextStatus }).eq('id', booking.id);
        toast.success(nextStatus === 'accepted' ? 'Booking accepted.' : 'Booking declined.');
      } catch {
        toast.error('Something went wrong.');
      } finally {
        const url = new URL(window.location.href);
        url.searchParams.delete('action');
        url.searchParams.delete('booking');
        router.replace(url.pathname, { scroll: false });
      }
    })();
  }, [sp, ownerId, router, supabase, cleanId]);

  return null;
}

function fmtClaimWindow(startAt: string | null, endAt: string | null) {
  if (!startAt && !endAt) return 'Always available';

  const start = startAt ? new Date(startAt) : null;
  const end = endAt ? new Date(endAt) : null;

  const startText = start && !isNaN(start.getTime()) ? start.toLocaleString() : startAt;
  const endText = end && !isNaN(end.getTime()) ? end.toLocaleString() : endAt;

  if (startText && endText) return `${startText} → ${endText}`;
  return startText || endText || 'Always available';
}

function confirmationHeading(actionType: string) {
  if (actionType === 'reserve') return 'Spot secured';
  if (actionType === 'book') return 'Slot claimed';
  if (actionType === 'enquire') return 'Availability claimed';
  if (actionType === 'pay' || actionType === 'order') return 'Action started';
  return 'Action confirmed';
}

function confirmationBody(actionType: string) {
  if (actionType === 'reserve') {
    return 'Your reserve was recorded successfully. Show this tag to staff if needed.';
  }
  if (actionType === 'book') {
    return 'Your slot is claimed. Continue below to complete your booking request.';
  }
  if (actionType === 'enquire') {
    return 'Your interest was recorded. A lighter enquiry follow-up flow can be added next.';
  }
  if (actionType === 'pay' || actionType === 'order') {
    return 'Your action was recorded and checkout is starting.';
  }
  return 'Your action was recorded successfully.';
}

export default function TagClient({ tagId, scanChartData }: Props) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const cleanId = useMemo(() => {
    const raw = decodeURIComponent(tagId || '').trim();
    return raw.startsWith('tag/') ? raw.slice(4) : raw;
  }, [tagId]);

  const variant = useMemo(() => assignVariant(EXP_ID, cleanId, VARIANTS), [cleanId]);
  const impressionSent = useRef(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://omninethq.co.uk';
  const baseTagUrl = `${origin}/tag/${encodeURIComponent(cleanId)}`;

  const [data, setData] = useState<any>(null);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState<number>(0);
  const [viewCount, setViewCount] = useState<number>(0);
  const [winnerChannel, setWinnerChannel] = useState<ShareChannel | null>(null);
  const [availabilityRefreshKey, setAvailabilityRefreshKey] = useState(0);
  const [claimConfirmation, setClaimConfirmation] = useState<ClaimConfirmationState | null>(null);
  const [reserveName, setReserveName] = useState('');
  const [reserveContact, setReserveContact] = useState('');
  const [reserveContactSaving, setReserveContactSaving] = useState(false);
  const [reserveContactSaved, setReserveContactSaved] = useState(false);
  const [availabilityActionBusy, setAvailabilityActionBusy] = useState<string | null>(null);

  const qrRef = useRef<HTMLDivElement>(null);
  const claimConfirmationRef = useRef<HTMLDivElement>(null);
  const inFlightClaimKeysRef = useRef<Record<string, string>>({});
  const router = useRouter();

  const shareCopyVariant = useMemo(() => {
    return assignVariant(SHARE_COPY_EXP_ID, `${cleanId}:share_copy`, SHARE_COPY_VARIANTS);
  }, [cleanId]);

  useEffect(() => {
    if (!cleanId || cleanId === 'id' || cleanId === 'undefined' || cleanId === 'null') {
      router.replace('/explore');
    }
  }, [cleanId, router]);

  useEffect(() => {
    const fetchTag = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('title, description, category, featured, user_id, bookings_enabled')
        .eq('id', cleanId)
        .maybeSingle();

      if (error) setError(error.message);
      else setData(data);
    };

    const fetchFeedback = async () => {
      const { data } = await supabase
        .from('feedback')
        .select('*')
        .eq('tag_id', cleanId)
        .eq('hidden', false)
        .order('created_at', { ascending: false });
      setFeedback(data || []);
    };

    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data?.user?.id || null);
    };

    const fetchViews = async () => {
      const { count, error } = await supabase
        .from('analytics_events')
        .select('*', { count: 'exact', head: true })
        .eq('event', 'view_tag')
        .eq('tag_id', cleanId);

      if (error) {
        console.warn('view count failed:', error.message);
        return;
      }

      setViewCount(count || 0);
    };

    const logScan = async () => {
      const { error: insertError } = await supabase.from('scans').insert([{ tag_id: cleanId }]);

      if (insertError) {
        console.warn('scan insert failed:', insertError.message);
        return;
      }

      const { count, error: countError } = await supabase
        .from('scans')
        .select('*', { count: 'exact', head: true })
        .eq('tag_id', cleanId);

      if (countError) {
        console.warn('scan count failed:', countError.message);
        return;
      }

      setScanCount(count || 0);
    };

    fetchTag();
    fetchFeedback();
    getUser();
    fetchViews();
    logScan();
  }, [cleanId, supabase]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data: win, error: winErr } = await supabase
          .from('tag_best_revenue_channel_30d')
          .select('channel')
          .eq('tag_id', cleanId)
          .maybeSingle();

        if (!mounted) return;
        if (winErr) {
          console.warn('winner lookup error:', winErr.message);
          setWinnerChannel(null);
          return;
        }

        const ch = normalizeWinnerChannel((win as any)?.channel ?? null);
        setWinnerChannel(ch);
      } catch (e) {
        console.warn('winner lookup failed', e);
        if (mounted) setWinnerChannel(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [cleanId, supabase]);

  useEffect(() => {
    const ch = getQueryParam('ch');
    const cv = getQueryParam('cv');
    if (ch || cv) {
      setLastAttribution(cleanId, { ch, cv });
    }
  }, [cleanId]);

  useEffect(() => {
    const ch = getQueryParam('ch');
    const cv = getQueryParam('cv');

    if (!ch) return;

    const key = `omninet_open_${cleanId}_${ch}_${cv || 'na'}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');

    logEvent('share_open', {
      tag_id: cleanId,
      channel: ch,
      meta: {
        copy_variant: cv || null,
        exp: SHARE_COPY_EXP_ID,
      },
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,
    }).catch(() => {});
  }, [cleanId]);

  useEffect(() => {
    logEvent('view_tag', { tag_id: cleanId }).catch(() => {});
  }, [cleanId]);

  useEffect(() => {
    if (!impressionSent.current) {
      logEvent('cta_impression', { tag_id: cleanId, experiment_id: EXP_ID, variant }).catch(() => {});
      impressionSent.current = true;
    }
  }, [cleanId, variant]);

  useEffect(() => {
    if (!claimConfirmation) return;
    claimConfirmationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [claimConfirmation]);

  useEffect(() => {
    const restored = loadClaimConfirmation(cleanId);
    setClaimConfirmation(restored);
  }, [cleanId]);

  useEffect(() => {
    saveClaimConfirmation(cleanId, claimConfirmation);
  }, [cleanId, claimConfirmation]);

  const isOwner = userId && data?.user_id && userId === data.user_id;
  const ownerId = data?.user_id as string | undefined;
  const EmailAction = <EmailActionProcessor cleanId={cleanId} ownerId={ownerId} />;

  const getAttrMeta = () => {
    const attr = getLastAttribution(cleanId);
    return {
      share_channel: attr?.ch || null,
      copy_variant: attr?.cv || null,
      share_exp: SHARE_COPY_EXP_ID,
    };
  };

  async function startCheckout(id: string, amountCents = 500) {
    try {
      const refCode = localStorage.getItem('referral_code') || '';
      const attr = getLastAttribution(cleanId);
      const ch = attr?.ch || '';
      const cv = attr?.cv || '';

      const meta = getAttrMeta();
      await logEvent('checkout_start', {
        tag_id: cleanId,
        experiment_id: EXP_ID,
        variant,
        meta,
      });

      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId: id, refCode, amountCents, ch, cv }),
      });

      const { url } = await res.json();
      if (url) window.location.href = url;
      else toast.error('Checkout failed');
    } catch {
      toast.error('Could not start checkout');
    }
  }

  const onPrimaryCTAClick = async () => {
    await logEvent('cta_click', { tag_id: cleanId, experiment_id: EXP_ID, variant }).catch(() => {});

    if (variant === 'A') {
      await logEvent('booking_start', { tag_id: cleanId, meta: getAttrMeta() }).catch(() => {});
      document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth' });
    } else {
      startCheckout(cleanId, 500);
    }
  };

  const onSupportClick = async () => {
    startCheckout(cleanId, 500);
  };

  const handleDownload = async () => {
    if (!qrRef.current) return;
    const dataUrl = await toPng(qrRef.current);
    const link = document.createElement('a');
    link.download = `${cleanId}-qr.png`;
    link.href = dataUrl;
    link.click();
    toast.success('QR code downloaded.');
  };

  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}

    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);

      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);

      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  const shareVariant = shareCopyVariant;
  const title = data?.title || 'OmniNet Tag';

  const sendShare = async (channel: ShareChannel) => {
    const cv = shareVariant;
    const url = buildShareUrl(baseTagUrl, channel, cv);
    const text = buildShareMessage({ title, url, channel, variant: cv });

    await logEvent('share_click', {
      tag_id: cleanId,
      channel,
      meta: {
        exp: SHARE_COPY_EXP_ID,
        copy_variant: cv,
        winner_channel: winnerChannel || null,
        message_len: text.length,
      },
    }).catch(() => {});

    if (channel === 'whatsapp') {
      const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.location.href = wa;
      return;
    }

    if (channel === 'sms') {
      const smsUrl = `sms:?&body=${encodeURIComponent(text)}`;
      window.location.href = smsUrl;
      return;
    }

    if (channel === 'copy') {
      const ok = await copyToClipboard(url);
      if (ok) {
        toast.success('Copied.');
        return;
      }

      try {
        if ((navigator as any).share) {
          await (navigator as any).share({ title, url });
          toast.success('Shared.');
          return;
        }
      } catch {}

      window.prompt('Copy this link:', url);
      toast('Tap and hold to copy');
      return;
    }

    try {
      const shareData = { title, text, url };
      if ((navigator as any).share) {
        await (navigator as any).share(shareData);
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('Link copied.');
    } catch {
      toast.error('Could not share right now');
    }
  };

  function makeAvailabilityIdempotencyKey(block: AvailabilityBlockRow, quantity: number) {
    const refKey = `${block.id}:${quantity}`;
    const existing = inFlightClaimKeysRef.current[refKey];
    if (existing) return existing;

    const at = block?.action_type || 'unknown';
    const next = `avail:${cleanId}:${block.id}:${at}:${quantity}:${crypto.randomUUID()}`;
    inFlightClaimKeysRef.current[refKey] = next;
    return next;
  }

  function isBlockLiveNow(block: Pick<AvailabilityBlockRow, 'status' | 'start_at' | 'end_at' | 'visibility'>) {
    if (block.status !== 'live') return false;
    if (block.visibility !== 'public') return false;

    const now = Date.now();
    const start = block.start_at ? new Date(block.start_at).getTime() : null;
    const end = block.end_at ? new Date(block.end_at).getTime() : null;

    if (start && start > now) return false;
    if (end && end < now) return false;

    return true;
  }

  async function resolveActionableBlock(clickedBlock: AvailabilityBlockRow): Promise<AvailabilityBlockRow> {
    const { data: exact, error: exactError } = await supabase
      .from('availability_blocks')
      .select('*')
      .eq('id', clickedBlock.id)
      .eq('tag_id', cleanId)
      .maybeSingle();

    if (exactError) {
      throw new Error('Could not verify availability right now.');
    }

    if (exact && isBlockLiveNow(exact as AvailabilityBlockRow)) {
      return exact as AvailabilityBlockRow;
    }

    const { data: candidates, error: candidatesError } = await supabase
      .from('availability_blocks')
      .select('*')
      .eq('tag_id', cleanId)
      .eq('status', 'live')
      .eq('visibility', 'public')
      .order('start_at', { ascending: true });

    if (candidatesError) {
      throw new Error('Could not load current availability.');
    }

    const liveNow = ((candidates ?? []) as AvailabilityBlockRow[]).find((b) => isBlockLiveNow(b));

    if (!liveNow) {
      throw new Error('No reservable availability is active right now.');
    }

    return liveNow;
  }

  async function claimAvailability(block: AvailabilityBlockRow, quantity = 1) {
    const idempotencyKey = makeAvailabilityIdempotencyKey(block, quantity);

    const { data, error } = await supabase.rpc('claim_availability_block', {
      p_block_id: block.id,
      p_idempotency_key: idempotencyKey,
      p_quantity: quantity,
      p_customer_name: null,
      p_customer_contact: null,
      p_channel: 'qr',
      p_referral_code: localStorage.getItem('referral_code'),
      p_meta: { source: 'tag_page', action_type: block.action_type },
    });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('availability block not found')) {
        throw new Error('This availability is no longer active. Please refresh and try again.');
      }
      throw error;
    }

    const row = (data as any)?.[0];
    if (!row?.action_id) throw new Error('Claim failed (no action_id returned).');
    return row as {
      action_id: string;
      action_status: string;
      block_id: string;
      block_remaining: number;
    };
  }

  async function notifyAvailabilityAction(params: {
    actionId: string;
    blockId: string;
    tagId: string;
  }) {
    const { data, error } = await supabase.functions.invoke('availability-notify', {
      body: {
        type: 'CLAIM',
        record: {
          action_id: params.actionId,
          block_id: params.blockId,
          tag_id: params.tagId,
        },
      },
    });

    if (error) {
      console.error('availability-notify invoke error', error);
      return;
    }

    if (data && data.ok === false) {
      console.error('availability-notify returned failure', data);
      return;
    }

    console.log('availability-notify success', data);
  }

  async function saveReserveContactDetails() {
    if (!claimConfirmation?.actionId) {
      toast.error('Missing claim reference.');
      return;
    }

    if (!reserveName.trim() && !reserveContact.trim()) {
      toast.error('Add at least a name or contact.');
      return;
    }

    setReserveContactSaving(true);

    try {
      const res = await fetch('/api/availability/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionId: claimConfirmation.actionId,
          name: reserveName.trim(),
          contact: reserveContact.trim(),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json?.error || 'Failed to save details.');
        setReserveContactSaving(false);
        return;
      }

      setReserveContactSaved(true);
      toast.success('Details added.');
    } catch (e) {
      console.error(e);
      toast.error('Could not save details.');
    } finally {
      setReserveContactSaving(false);
    }
  }

  async function startCheckoutForBlock(block: AvailabilityBlockRow, actionId: string) {
    const refCode = localStorage.getItem('referral_code') || '';
    const attr = getLastAttribution(cleanId);
    const ch = attr?.ch || '';
    const cv = attr?.cv || '';

    const amountCents =
      typeof block.price_pence === 'number' && block.price_pence >= 0 ? Math.round(block.price_pence) : 500;

    await logEvent('checkout_start', {
      tag_id: cleanId,
      experiment_id: EXP_ID,
      variant,
      meta: {
        ...getAttrMeta(),
        block_id: block.id,
        availability_action_id: actionId,
        action_type: block.action_type,
        price_pence: block.price_pence ?? null,
      },
    }).catch(() => {});

    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tagId: cleanId,
        refCode,
        amountCents,
        ch,
        cv,
        blockId: block.id,
        availabilityActionId: actionId,
      }),
    });

    const json = await res.json();
    if (json?.url) window.location.href = json.url;
    else toast.error('Checkout failed');
  }

  async function handleAvailabilityPrimaryAction(blockAny: AvailabilityBlockRow) {
    const busyKey = `${blockAny.id}:1`;
    if (availabilityActionBusy === busyKey) return;

    setAvailabilityActionBusy(busyKey);

    try {
      const block = await resolveActionableBlock(blockAny);

      await logEvent('availability_click', {
        tag_id: cleanId,
        meta: {
          block_id: block.id,
          action_type: block.action_type,
          price_pence: block.price_pence ?? null,
        },
      }).catch(() => {});

      const claim = await claimAvailability(block, 1);

      setAvailabilityRefreshKey((k) => k + 1);

      void notifyAvailabilityAction({
        actionId: claim.action_id,
        blockId: block.id,
        tagId: cleanId,
      });

      const nextConfirmation = {
        actionId: claim.action_id,
        blockId: block.id,
        actionType: block.action_type,
        title: block.title ?? null,
        startAt: block.start_at ?? null,
        endAt: block.end_at ?? null,
        quantity: 1,
      };

      setClaimConfirmation(nextConfirmation);
      saveClaimConfirmation(cleanId, nextConfirmation);

      setReserveName('');
      setReserveContact('');
      setReserveContactSaved(false);

      if (block.action_type === 'book') {
        try {
          sessionStorage.setItem(
            `omni_booking_ctx_${cleanId}`,
            JSON.stringify({
              mode: block.action_type,
              blockId: block.id,
              title: block.title ?? null,
              startAt: block.start_at ?? null,
              endAt: block.end_at ?? null,
            })
          );
        } catch {}

        toast.success('Slot claimed. Continue below to complete your booking request.');
        document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth' });
        return;
      }

      if (block.action_type === 'reserve') {
        toast.success('Reserved successfully. Show this tag to staff if needed.');
        return;
      }

      if (block.action_type === 'enquire') {
        toast.success('Availability claimed. We will add a lighter enquiry flow next.');
        return;
      }

      if (block.action_type === 'pay' || block.action_type === 'order') {
        await startCheckoutForBlock(block, claim.action_id);
        return;
      }

      toast.error('Unknown action type.');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to start action.');
    } finally {
      delete inFlightClaimKeysRef.current[busyKey];
      setAvailabilityActionBusy(null);
    }
  }

  const handleDeleteFeedback = async (id: string) => {
    if (!confirm('Are you sure you want to hide this comment?')) return;
    const { error } = await supabase.from('feedback').update({ hidden: true }).eq('id', id);
    if (!error) {
      setFeedback((prev) => prev.filter((f) => f.id !== id));
      toast.success('Feedback hidden');
    } else toast.error('Failed to hide feedback');
  };

  const handleSubmitFeedback = async (e: FormEvent) => {
    e.preventDefault();
    if (rating === '' || Number.isNaN(rating)) {
      toast.error('Please select a rating.');
      return;
    }
    const { error } = await supabase.from('feedback').insert([{ tag_id: cleanId, name: name || 'Anonymous', message, rating }]);
    if (!error) {
      setName('');
      setMessage('');
      setRating('');
      const { data } = await supabase
        .from('feedback')
        .select('*')
        .eq('tag_id', cleanId)
        .eq('hidden', false)
        .order('created_at', { ascending: false });
      setFeedback(data || []);
      toast.success('Feedback submitted!');
    } else toast.error('Failed to submit feedback');
  };

  const averageRating = feedback.length
    ? (feedback.reduce((s, f) => s + (f.rating || 0), 0) / feedback.length).toFixed(1)
    : null;

  if (error || !data)
    return (
      <div className="p-10 text-center text-red-600">
        <h1 className="text-2xl font-bold">Tag Not Found</h1>
        <p>ID: {cleanId}</p>
      </div>
    );

  const getBadge = (cat: string) =>
    ({
      rent: 'bg-blue-100 text-blue-800',
      sell: 'bg-green-100 text-green-800',
      teach: 'bg-yellow-100 text-yellow-800',
      help: 'bg-purple-100 text-purple-800',
    }[cat] || 'bg-gray-100 text-gray-800');

  const defaultChannels: ShareChannel[] = ['whatsapp', 'sms', 'copy', 'system'];
  const orderedShareChannels: ShareChannel[] = winnerChannel
    ? [winnerChannel, ...defaultChannels.filter((c) => c !== winnerChannel)]
    : defaultChannels;

  const tagUrlForQR = buildShareUrl(baseTagUrl, 'copy', shareVariant);

  const shareButtonBase = 'h-10 px-4 rounded-xl border border-amber-200 bg-white shadow-sm text-sm text-amber-900 hover:bg-amber-50 transition';
  const shareButtonWinner = 'border-amber-900 bg-amber-900 text-white hover:bg-amber-800';

  return (
    <div className="min-h-screen bg-amber-50/60">
      <Toaster position="top-center" />
      <A2HSNudge />
      {EmailAction}

      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <BackButton />
        </div>

        <div className="rounded-3xl border border-amber-100 bg-white/90 p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/category/${data.category}`}>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getBadge(data.category)}`}>
                  {data.category}
                </span>
              </Link>
              {isOwner && (
                <OwnerBookingToggle tagId={cleanId} tagOwnerId={data.user_id} initialEnabled={!!data.bookings_enabled} />
              )}
            </div>

            <h1 className="text-3xl font-semibold leading-tight text-amber-950 md:text-4xl">
              {data.title}
            </h1>

            {data.description ? (
              <p className="text-base leading-relaxed text-amber-900/70">
                {data.description}
              </p>
            ) : null}

            <div className="space-y-1">
              <div className="text-lg font-semibold text-amber-950">
                You're seeing live availability.
              </div>
              <div className="text-sm text-amber-900/70">
                When it's gone, it disappears.
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-amber-900/70">
              <span>Tag ID: {cleanId}</span>
              <span>{scanCount} scans</span>
              <span>{viewCount} views</span>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="h-11 px-5 rounded-2xl border border-amber-200 bg-amber-50 text-sm text-amber-900"
                disabled
                aria-disabled="true"
              >
                This tag uses live availability.
              </button>
            </div>
          </div>
        </div>

        <section className="mt-10">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-amber-950">Availability</h2>
          </div>
          <AvailabilityPublicSection
            tagId={cleanId}
            onAction={handleAvailabilityPrimaryAction}
            refreshKey={availabilityRefreshKey}
          />
        </section>

        {claimConfirmation && (
          <section
            ref={claimConfirmationRef}
            className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-green-800">Confirmation</div>
                <h3 className="mt-1 text-xl font-semibold text-green-900">
                  {confirmationHeading(claimConfirmation.actionType)}
                </h3>
                <p className="mt-2 text-sm text-green-900/80">
                  {confirmationBody(claimConfirmation.actionType)}
                </p>

                <div className="mt-4 space-y-1 text-sm text-green-900/80">
                  {claimConfirmation.title && (
                    <div>
                      <span className="font-medium">Availability:</span> {claimConfirmation.title}
                    </div>
                  )}
                  <div>
                    <span className="font-medium">Time:</span>{' '}
                    {fmtClaimWindow(claimConfirmation.startAt, claimConfirmation.endAt)}
                  </div>
                  <div>
                    <span className="font-medium">Quantity:</span> {claimConfirmation.quantity}
                  </div>
                  <div>
                    <span className="font-medium">Reference:</span> {claimConfirmation.actionId}
                  </div>
                  <div className="text-xs text-green-900/60 mt-2">
                    This confirmation is stored on this device for a limited time.
                  </div>
                </div>

                {claimConfirmation.actionType === 'book' && (
                  <div className="mt-4 text-sm font-medium text-green-900">
                    Continue below to complete your booking request.
                  </div>
                )}

                {claimConfirmation.actionType === 'reserve' && (
                  <div className="mt-4 text-sm font-medium text-green-900">
                    Keep this page open or show it to staff if needed.
                  </div>
                )}

                {claimConfirmation.actionType === 'reserve' && (
                  <div className="mt-4 rounded-xl border border-green-200 bg-white p-4">
                    <div className="text-sm font-medium text-green-900">
                      Add your details for easier follow-up
                    </div>
                    <p className="mt-1 text-xs text-green-900/70">
                      Optional. This helps the owner contact you if needed.
                    </p>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input
                        value={reserveName}
                        onChange={(e) => setReserveName(e.target.value)}
                        placeholder="Your name (optional)"
                        className="w-full rounded-xl border border-green-200 bg-white p-2 text-sm"
                        disabled={reserveContactSaving || reserveContactSaved}
                      />
                      <input
                        value={reserveContact}
                        onChange={(e) => setReserveContact(e.target.value)}
                        placeholder="Phone or contact (optional)"
                        className="w-full rounded-xl border border-green-200 bg-white p-2 text-sm"
                        disabled={reserveContactSaving || reserveContactSaved}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={saveReserveContactDetails}
                        disabled={reserveContactSaving || reserveContactSaved}
                        className="h-10 px-4 rounded-xl bg-green-900 text-white hover:bg-green-800 transition text-sm disabled:opacity-50"
                      >
                        {reserveContactSaved
                          ? 'Details saved'
                          : reserveContactSaving
                            ? 'Saving...'
                            : 'Add details'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {claimConfirmation.actionType === 'book' && (
                  <button
                    type="button"
                    onClick={() => document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth' })}
                    className="h-10 px-4 rounded-xl bg-green-900 text-white hover:bg-green-800 transition text-sm"
                  >
                    Continue booking
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setClaimConfirmation(null);
                    saveClaimConfirmation(cleanId, null);
                    setReserveName('');
                    setReserveContact('');
                    setReserveContactSaved(false);
                  }}
                  className="h-10 px-4 rounded-xl border border-green-300 bg-white text-sm text-green-900 hover:bg-green-100 transition"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="mt-10 grid gap-6 md:grid-cols-[320px_1fr]">
          <div className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
            <div className="text-sm font-medium text-amber-950">QR code</div>
            <div ref={qrRef} className="mt-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-100">
              <QRCode value={tagUrlForQR} size={180} level="H" />
            </div>
            <p className="mt-3 text-xs text-amber-900/60">
              Scan this QR to view this tag instantly
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={handleDownload}
                className="h-10 px-4 rounded-xl bg-amber-900 text-white shadow-sm hover:bg-amber-800 transition text-sm"
              >
                Download QR
              </button>
              <Link
                href={`/tag/${encodeURIComponent(cleanId)}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="h-10 px-4 rounded-xl border border-amber-200 bg-white text-sm text-amber-900 shadow-sm hover:bg-amber-50 transition"
              >
                Print QR
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-amber-950">Share</div>
                <div className="text-xs text-amber-900/60">Choose a channel</div>
              </div>
              {winnerChannel && (
                <div className="text-xs text-amber-900/70 border border-amber-100 rounded-2xl px-3 py-2 bg-amber-50">
                  Most successful via <span className="font-semibold">{labelForChannel(winnerChannel)}</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {isOwner && (
                <button
                  onClick={() => router.push(`/tag/${encodeURIComponent(cleanId)}/availability`)}
                  className="h-10 px-4 rounded-xl bg-amber-900 text-white shadow-sm hover:bg-amber-800 transition text-sm"
                  title="Owner only"
                >
                  Manage availability
                </button>
              )}

              {orderedShareChannels.map((ch) => {
                const isWinner = winnerChannel === ch;

                const label =
                  ch === 'whatsapp'
                    ? 'WhatsApp'
                    : ch === 'sms'
                      ? 'SMS'
                      : ch === 'copy'
                        ? 'Copy Link'
                        : 'Share';

                return (
                  <button
                    key={ch}
                    onClick={() => sendShare(ch)}
                    className={`${shareButtonBase} ${isWinner ? shareButtonWinner : ''}`}
                    title={isWinner ? 'Most successful channel' : `Copy variant ${shareVariant}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 text-[11px] text-amber-900/60">
              Share copy test: <span className="font-mono">{SHARE_COPY_EXP_ID}</span> variant{' '}
              <span className="font-mono">{shareVariant}</span>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <ScanAnalytics data={scanChartData} />
        </section>

        <section className="mt-10 rounded-2xl border border-amber-100 bg-white p-6 shadow-sm" id="booking-section">
          <h2 className="text-xl font-semibold text-amber-950 mb-4">Booking</h2>
          <BookingRequestForm tagId={cleanId} enabled={!!data.bookings_enabled} />
          {isOwner && <BookingRequestsList tagId={cleanId} ownerId={data.user_id} />}
        </section>

        <section className="mt-10 rounded-2xl border border-amber-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-amber-950 mb-4">Feedback</h2>

          {averageRating && (
            <p className="text-sm text-amber-900/70 mb-3">
              Average Rating: {averageRating} ({feedback.length} reviews)
            </p>
          )}

          <ul className="space-y-4 mb-6">
            {feedback.map((f) => (
              <li key={f.id} className="border border-amber-100 p-3 rounded-xl bg-white shadow-sm">
                <div className="flex justify-between items-center mb-1">
                  <p className="text-sm text-amber-900">
                    Rating: {f.rating} by {f.name}
                  </p>
                  {isOwner && (
                    <button onClick={() => handleDeleteFeedback(f.id)} className="text-xs text-red-600 hover:underline">
                      Hide
                    </button>
                  )}
                </div>
                <p className="text-sm text-amber-900/80">{f.message}</p>
              </li>
            ))}
          </ul>

          <form onSubmit={handleSubmitFeedback} className="space-y-3">
            <input
              className="w-full rounded-xl border border-amber-200 bg-white p-2 text-sm"
              placeholder="Your name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <textarea
              className="w-full rounded-xl border border-amber-200 bg-white p-2 text-sm"
              placeholder="Your comment..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
            <select
              className="w-full rounded-xl border border-amber-200 bg-white p-2 text-sm"
              value={rating}
              onChange={(e) => {
                const v = e.target.value;
                setRating(v === '' ? '' : parseInt(v, 10));
              }}
              required
            >
              <option value="">Rate this tag</option>
              {[1, 2, 3, 4, 5].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button type="submit" className="h-10 px-4 rounded-xl bg-amber-900 text-white hover:bg-amber-800">
              Submit Feedback
            </button>
          </form>
        </section>

        <div className="mt-8 text-xs text-amber-900/60">This page updates in real time.</div>
      </div>
    </div>
  );
}