'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
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
function buildShareMessage(opts: {
  title: string;
  url: string;
  channel: ShareChannel;
  variant: 'A' | 'B';
}) {
  const { title, url, channel, variant } = opts;

  // Keep it short. People don’t read.
  if (channel === 'whatsapp') {
    return variant === 'A'
      ? `Quick one — check this out:\n${title}\n${url}`
      : `This local service is worth saving:\n${title}\n${url}`;
  }

  if (channel === 'sms') {
    return variant === 'A'
      ? `Check this out: ${title} — ${url}`
      : `Local help/service: ${title} — ${url}`;
  }

  if (channel === 'copy') {
    return variant === 'A'
      ? `Check this out on OmniNet:\n${title}\n${url}`
      : `Local service on OmniNet:\n${title}\n${url}`;
  }

  // system share
  return variant === 'A' ? `Check this out: ${title}` : `Local service: ${title}`;
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

        const { data: booking } = await supabase
          .from('bookings')
          .select('id, status, tag_id')
          .eq('id', bookingId)
          .single();

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
        toast.success(nextStatus === 'accepted' ? '✅ Booking accepted.' : '❌ Booking declined.');
      } catch {
        toast.error('Something went wrong.');
      } finally {
        const url = new URL(window.location.href);
        url.searchParams.delete('action');
        url.searchParams.delete('booking');
        router.replace(url.pathname, { scroll: false });
      }
    })();
  }, [sp, ownerId, router, supabase]);

  return null;
}

export default function TagClient({ tagId, scanChartData }: Props) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const cleanId = useMemo(() => decodeURIComponent(tagId || '').trim(), [tagId]);

  const variant = useMemo(() => assignVariant(EXP_ID, cleanId, VARIANTS), [cleanId]);
  const impressionSent = useRef(false);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://omninethq.co.uk';
  const baseTagUrl = `${origin}/tag/${encodeURIComponent(cleanId)}`;

  const [data, setData] = useState<any>(null);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState<number>(0);
  const qrRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Winner channel state
  const [winnerChannel, setWinnerChannel] = useState<ShareChannel | null>(null);

  // Share-copy A/B variant (sticky per device/tag/channel)
  const shareCopyVariant = useMemo(() => {
    // key includes tagId so different tags can converge to different copy
    return assignVariant(SHARE_COPY_EXP_ID, `${cleanId}:share_copy`, SHARE_COPY_VARIANTS);
  }, [cleanId]);

  // ---------- Basic data ----------
  useEffect(() => {
    if (!cleanId || cleanId === 'id' || cleanId === 'undefined' || cleanId === 'null') {
      router.replace('/explore');
    }
  }, [cleanId, router]);

  useEffect(() => {
    const fetchTag = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('title, description, category, views, featured, user_id, bookings_enabled')
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

    const logScan = async () => {
      await supabase.from('scans').insert([{ tag_id: cleanId }]);
      const { count } = await supabase
        .from('scans')
        .select('*', { count: 'exact', head: true })
        .eq('tag_id', cleanId);
      setScanCount(count || 0);
    };

    fetchTag();
    fetchFeedback();
    getUser();
    logScan();
  }, [cleanId, supabase]);

  // ---------- Winner channel fetch ----------
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data: win, error: winErr } = await supabase
          .from('tag_best_channel_30d')
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

  // ---------- Attribution on open ----------
  useEffect(() => {
    const ch = getQueryParam('ch');
    const cv = getQueryParam('cv');
    if (ch || cv) {
      setLastAttribution(cleanId, { ch, cv });
    }
  }, [cleanId]);

  // Log share_open once per (tag, ch, cv)
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

  // ---------- Analytics ----------
  useEffect(() => {
    logEvent('view_tag', { tag_id: cleanId }).catch(() => {});
  }, [cleanId]);

  useEffect(() => {
    if (!impressionSent.current) {
      logEvent('cta_impression', { tag_id: cleanId, experiment_id: EXP_ID, variant }).catch(() => {});
      impressionSent.current = true;
    }
  }, [cleanId, variant]);

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

  // ---------- CTA + payments ----------
  async function startCheckout(id: string, amountCents = 500) {
    try {
      const refCode = localStorage.getItem('referral_code') || '';

      // include attribution for analytics (NOT Stripe yet)
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
        body: JSON.stringify({ tagId: id, refCode, amountCents }),
      });

      const { url } = await res.json();
      if (url) window.location.href = url;
      else toast.error('❌ Checkout failed');
    } catch {
      toast.error('❌ Could not start checkout');
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

  // ---------- Share handlers with A/B copy ----------
  const handleDownload = async () => {
    if (!qrRef.current) return;
    const dataUrl = await toPng(qrRef.current);
    const link = document.createElement('a');
    link.download = `${cleanId}-qr.png`;
    link.href = dataUrl;
    link.click();
    toast.success('📥 QR code downloaded!');
  };

  const shareVariant = shareCopyVariant; // 'A' | 'B'
  const title = data?.title || 'OmniNet Tag';

  const sendShare = async (channel: ShareChannel) => {
    const cv = shareVariant;
    const url = buildShareUrl(baseTagUrl, channel, cv);
    const text = buildShareMessage({ title, url, channel, variant: cv });

    // log click
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

    // Execute action
    if (channel === 'whatsapp') {
      const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(wa, '_blank');
      return;
    }

    if (channel === 'sms') {
      const smsUrl = `sms:?&body=${encodeURIComponent(text)}`;
      window.location.href = smsUrl;
      return;
    }

    if (channel === 'copy') {
      await navigator.clipboard.writeText(text);
      toast.success('🔗 Copied!');
      return;
    }

    // system share
    try {
      const shareData = { title, text, url };
      if ((navigator as any).share) {
        await (navigator as any).share(shareData);
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('🔗 Link copied!');
    } catch {
      toast.error('❌ Could not share right now');
    }
  };

  // ---------- Feedback handlers ----------
  const handleDeleteFeedback = async (id: string) => {
    if (!confirm('Are you sure you want to hide this comment?')) return;
    const { error } = await supabase.from('feedback').update({ hidden: true }).eq('id', id);
    if (!error) {
      setFeedback((prev) => prev.filter((f) => f.id !== id));
      toast.success('🗑 Feedback hidden');
    } else toast.error('❌ Failed to hide feedback');
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === '' || Number.isNaN(rating)) {
      toast.error('Please select a rating.');
      return;
    }
    const { error } = await supabase.from('feedback').insert([
      { tag_id: cleanId, name: name || 'Anonymous', message, rating },
    ]);
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
      toast.success('✅ Feedback submitted!');
    } else toast.error('❌ Failed to submit feedback');
  };

  // ---------- UI ----------
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

  const getEmoji = (cat: string) =>
    ({ rent: '🪜', sell: '🛒', teach: '🎓', help: '🤝' }[cat] || '');

  const defaultChannels: ShareChannel[] = ['whatsapp', 'sms', 'copy', 'system'];
  const orderedShareChannels: ShareChannel[] = winnerChannel
    ? [winnerChannel, ...defaultChannels.filter((c) => c !== winnerChannel)]
    : defaultChannels;

  // QR uses copy channel + variant so scans are attributable
  const tagUrlForQR = buildShareUrl(baseTagUrl, 'copy', shareVariant);

  return (
    <div className="p-10 text-center">
      <Toaster position="top-center" />
      <A2HSNudge />
      {EmailAction}
      <BackButton />

      <h1 className="text-3xl font-bold mb-2">{data.title}</h1>

      {isOwner && (
        <div className="my-2">
          <OwnerBookingToggle
            tagId={cleanId}
            tagOwnerId={data.user_id}
            initialEnabled={!!data.bookings_enabled}
          />
        </div>
      )}

      {data.featured && <p className="text-sm text-yellow-600 mb-2">✨ Featured by OmniNet</p>}
      <p className="text-gray-600 mb-2">{data.description}</p>

      <Link href={`/category/${data.category}`}>
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getBadge(data.category)}`}>
          {getEmoji(data.category)} {data.category}
        </span>
      </Link>

      <p className="text-sm text-gray-400 mt-4 mb-1">Tag ID: {cleanId}</p>
      <p className="text-xs text-gray-500 mb-1">🔢 {scanCount} scans</p>
      {typeof data.views === 'number' && <p className="text-xs text-gray-500 mb-4">👁️ {data.views} views</p>}

      <div className="my-4 flex justify-center">
        <button
          onClick={onPrimaryCTAClick}
          className="h-12 px-6 rounded-2xl text-white bg-black hover:bg-gray-800 transition text-sm"
        >
          {variant === 'A' ? '📅 Book now' : '💸 Support this Tag'}
        </button>
      </div>

      <div className="flex flex-col items-center gap-3 mb-8">
        <div ref={qrRef} className="bg-white p-3 rounded shadow">
          <QRCode value={tagUrlForQR} size={160} level="H" />
        </div>

        <p className="text-sm text-gray-500">📱 Scan this QR to view this tag instantly</p>

        {winnerChannel && (
          <div className="text-xs text-gray-600 border rounded-2xl px-3 py-2 bg-white shadow-sm">
            🏆 Most successful via <span className="font-semibold">{labelForChannel(winnerChannel)}</span>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-3 mt-2">
          <button
            onClick={handleDownload}
            className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition text-sm"
          >
            📥 Download QR
          </button>

          {orderedShareChannels.map((ch) => {
            const isWinner = winnerChannel === ch;

            const base = 'rounded-xl border px-4 py-2 transition text-sm hover:bg-gray-50';
            const winnerStyle = 'border-black bg-black text-white hover:bg-gray-800';

            const label =
              ch === 'whatsapp'
                ? '💬 WhatsApp'
                : ch === 'sms'
                ? '✉️ SMS'
                : ch === 'copy'
                ? '🔗 Copy Link'
                : '📣 Share';

            return (
              <button
                key={ch}
                onClick={() => sendShare(ch)}
                className={`${base} ${isWinner ? winnerStyle : ''}`}
                title={isWinner ? 'Most successful channel' : `Copy variant ${shareVariant}`}
              >
                {label}
              </button>
            );
          })}

          <Link
            href={`/tag/${encodeURIComponent(cleanId)}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border px-4 py-2 transition text-sm hover:bg-gray-50"
          >
            🖨️ Print QR
          </Link>

          <button
            onClick={onSupportClick}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition text-sm"
          >
            💸 Support this Tag
          </button>
        </div>

        <div className="text-[11px] text-gray-400 mt-1">
          Share copy test: <span className="font-mono">{SHARE_COPY_EXP_ID}</span> variant{' '}
          <span className="font-mono">{shareVariant}</span>
        </div>
      </div>

      <ScanAnalytics data={scanChartData} />

      <hr className="my-8 border-gray-300" />
      <h2 id="booking-section" className="text-xl font-semibold mb-4">📅 Booking</h2>
      <BookingRequestForm tagId={cleanId} enabled={!!data.bookings_enabled} />
      {isOwner && <BookingRequestsList tagId={cleanId} ownerId={data.user_id} />}

      <hr className="my-8 border-gray-300" />
      <h2 className="text-xl font-semibold mb-4">💬 Feedback</h2>

      {averageRating && (
        <p className="text-sm text-yellow-600 mb-2">
          ⭐ Average Rating: {averageRating} ({feedback.length} reviews)
        </p>
      )}

      <ul className="space-y-4 mb-6 max-w-lg mx-auto text-left">
        {feedback.map((f) => (
          <li key={f.id} className="border p-3 rounded bg-white shadow">
            <div className="flex justify-between items-center mb-1">
              <p className="text-sm text-gray-700">
                ⭐ {f.rating} by {f.name}
              </p>
              {isOwner && (
                <button
                  onClick={() => handleDeleteFeedback(f.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  🗑 Hide
                </button>
              )}
            </div>
            <p className="text-sm text-gray-800">{f.message}</p>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmitFeedback} className="space-y-3 text-left max-w-md mx-auto">
        <input
          className="w-full border p-2 rounded"
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className="w-full border p-2 rounded"
          placeholder="Your comment..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
        />
        <select
          className="w-full border p-2 rounded"
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
              {r} ⭐
            </option>
          ))}
        </select>
        <button type="submit" className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800">
          Submit Feedback
        </button>
      </form>
    </div>
  );
}


