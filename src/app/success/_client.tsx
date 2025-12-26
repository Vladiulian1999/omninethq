'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast, { Toaster } from 'react-hot-toast';
import { BackButton } from '@/components/BackButton';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { logEvent } from '@/lib/analytics';

type SuccessInfo = {
  ok: boolean;
  amount_cents?: number;
  currency?: string;
  tagId?: string | null;
  refCode?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  error?: string;
};

type VariantKey = 'InviteFriend' | 'SupportLocal' | 'DiscoverMore';

const VARIANTS: Record<
  VariantKey,
  { title: string; body: (tagTitle?: string | null) => string; cta: string }
> = {
  InviteFriend: {
    title: 'Share the love 💌',
    body: (t) =>
      t ? `Invite a friend to try “${t}” on OmniNet.` : 'Invite a friend to try this OmniTag on OmniNet.',
    cta: 'Share this tag',
  },
  SupportLocal: {
    title: 'Help it grow 🌱',
    body: (t) =>
      t ? `Share “${t}” — support local skills & services.` : 'Share this tag — support local skills & services.',
    cta: 'Share to friends',
  },
  DiscoverMore: {
    title: 'Know someone who’d love this? ✨',
    body: (t) =>
      t ? `Pass “${t}” along — it might be perfect for them.` : 'Pass this along — it might be perfect for them.',
    cta: 'Share with a friend',
  },
};

function cleanId(v: string) {
  return (v || '').replace(/[<>\s]/g, '');
}

export default function SuccessClient({
  sessionId,
  tagFromQS,
  chFromQS,
  cvFromQS,
}: {
  sessionId: string;
  tagFromQS?: string;
  chFromQS?: string;
  cvFromQS?: string;
}) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [info, setInfo] = useState<SuccessInfo | null>(null);
  const [tagTitle, setTagTitle] = useState<string | null>(null);
  const [refUsername, setRefUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://omninethq.co.uk';

  const [variant, setVariant] = useState<VariantKey>('InviteFriend');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = 'exp_success_share_variant';
    const existing = window.localStorage.getItem(key) as VariantKey | null;
    if (existing && VARIANTS[existing]) {
      setVariant(existing);
      return;
    }
    const keys: VariantKey[] = ['InviteFriend', 'SupportLocal', 'DiscoverMore'];
    const pick = keys[Math.floor(Math.random() * keys.length)];
    window.localStorage.setItem(key, pick);
    setVariant(pick);
  }, []);

  // Load Stripe session details
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const url = sessionId
          ? `/api/success?session_id=${encodeURIComponent(sessionId)}`
          : `/api/success`;
        const res = await fetch(url, { cache: 'no-store' });
        const data = (await res.json()) as SuccessInfo;
        if (!mounted) return;
        setInfo(data);
      } catch (e: any) {
        if (!mounted) return;
        setInfo({ ok: false, error: e?.message || 'Failed to load' });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [sessionId]);

  const tagIdClean = useMemo(
    () => cleanId((info?.tagId || tagFromQS || '').toString()),
    [info?.tagId, tagFromQS]
  );

  const tagUrl = useMemo(() => {
    return tagIdClean ? `${origin}/tag/${encodeURIComponent(tagIdClean)}` : `${origin}/explore`;
  }, [tagIdClean, origin]);

  // Fetch tag title
  useEffect(() => {
    (async () => {
      if (!tagIdClean) return;
      const { data } = await supabase
        .from('messages')
        .select('title')
        .eq('id', tagIdClean)
        .maybeSingle();
      setTagTitle((data as any)?.title || null);
    })();
  }, [supabase, tagIdClean]);

  // Resolve referrer display name
  useEffect(() => {
    (async () => {
      const code = ((info?.refCode || '') as string).toLowerCase().trim();
      if (!code) return;
      const { data } = await supabase
        .from('users')
        .select('username, email')
        .eq('referral_code', code)
        .maybeSingle();
      if (data) {
        const disp =
          ((data as any).username && (data as any).username.trim()) ||
          ((data as any).email ? (data as any).email.split('@')[0] : null);
        setRefUsername(disp || null);
      }
    })();
  }, [supabase, info?.refCode]);

  const amountGBP = useMemo(() => {
    if (!info?.amount_cents) return null;
    return `£${(info.amount_cents / 100).toFixed(2)}`;
  }, [info?.amount_cents]);

  // ✅ LOG CHECKOUT SUCCESS (ONCE per session)
  useEffect(() => {
    if (loading) return;
    if (!sessionId) return;
    if (!info?.ok) return;

    const key = `omni_checkout_success_${sessionId}`;
    if (typeof window !== 'undefined' && window.localStorage.getItem(key)) return;
    if (typeof window !== 'undefined') window.localStorage.setItem(key, '1');

    const tag_id = tagIdClean || undefined;
    const channel = (chFromQS && chFromQS.trim()) ? chFromQS.trim() : undefined;
    const copy_variant = (cvFromQS && cvFromQS.trim()) ? cvFromQS.trim() : undefined;

    logEvent('checkout_success', {
      tag_id,
      channel,
      meta: {
        session_id: sessionId,
        copy_variant,
        success_variant: variant,
        amount_cents: info?.amount_cents ?? undefined,
        currency: info?.currency ?? undefined,
        refCode: info?.refCode ?? undefined,
      },
    }).catch(() => {});
  }, [
    loading,
    sessionId,
    info?.ok,
    tagIdClean,
    chFromQS,
    cvFromQS,
    variant,
    info?.amount_cents,
    info?.currency,
    info?.refCode,
  ]);

  const handleShareTag = async () => {
    await logEvent('share_click', {
      tag_id: tagIdClean || undefined,
      channel: 'system',
      meta: { from: '/success', success_variant: variant },
    }).catch(() => {});

    try {
      const title = tagTitle ? `Check out "${tagTitle}" on OmniNet` : 'Check out this OmniTag on OmniNet';
      if (typeof navigator !== 'undefined' && 'share' in navigator && (navigator as any).share) {
        await (navigator as any).share({ title, url: tagUrl });
        return;
      }
      await navigator.clipboard.writeText(tagUrl);
      toast.success('🔗 Link copied!');
    } catch {
      toast.error('Could not share right now.');
    }
  };

  const handleCopyTagLink = async () => {
    await logEvent('share_click', {
      tag_id: tagIdClean || undefined,
      channel: 'copy',
      meta: { from: '/success' },
    }).catch(() => {});
    try {
      await navigator.clipboard.writeText(tagUrl);
      toast.success('🔗 Link copied!');
    } catch {
      toast.error('Could not copy link.');
    }
  };

  const v = VARIANTS[variant];

  return (
    <div className="p-8 max-w-2xl mx-auto text-center">
      <Toaster position="top-center" />
      <BackButton />

      <h1 className="text-3xl font-bold mt-4 mb-2">Thank you! 🎉</h1>

      {loading && <p className="text-gray-600">Confirming your payment…</p>}

      {!loading && info?.ok && (
        <>
          <p className="text-gray-700">
            {amountGBP ? `You donated ${amountGBP}. ` : 'Your donation was received. '}
            {tagTitle ? (
              <>
                You supported <span className="font-semibold">{tagTitle}</span>.
              </>
            ) : (
              <>Thanks for supporting this tag.</>
            )}
          </p>

          {info.refCode && (
            <p className="mt-2 text-gray-600">
              Referred by{' '}
              <span className="font-semibold">{refUsername ? `@${refUsername}` : info.refCode}</span>
            </p>
          )}

          {tagIdClean && (
            <div className="mt-6 border rounded-2xl p-4 bg-white shadow-sm">
              <h3 className="font-semibold mb-1">{v.title}</h3>
              <p className="text-sm text-gray-600">{v.body(tagTitle)}</p>
              <p className="text-xs text-gray-400 break-all mt-1">{tagUrl}</p>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={handleShareTag}
                  className="border rounded-xl px-4 py-2 text-sm hover:bg-gray-50"
                >
                  📣 {v.cta}
                </button>
                <button
                  onClick={handleCopyTagLink}
                  className="border rounded-xl px-4 py-2 text-sm hover:bg-gray-50"
                >
                  🔗 Copy link
                </button>
                <Link
                  href={`/tag/${tagIdClean}/print`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border rounded-xl px-4 py-2 text-sm hover:bg-gray-50"
                >
                  🖨️ Print QR
                </Link>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href={tagUrl} className="border rounded-xl px-4 py-2 hover:bg-gray-50">
              View the tag
            </Link>
            <Link href="/explore" className="border rounded-xl px-4 py-2 hover:bg-gray-50">
              Explore more
            </Link>
          </div>

          <div className="mt-8 border rounded-2xl p-4 text-left bg-white shadow-sm">
            <h3 className="font-semibold mb-2">Receipt</h3>
            <div className="text-sm text-gray-700 space-y-1">
              {info.customer_name && <div>Donor: {info.customer_name}</div>}
              {info.customer_email && <div>Email: {info.customer_email}</div>}
              {amountGBP && <div>Amount: {amountGBP}</div>}
              <div>Session ID: {sessionId || '—'}</div>
            </div>
          </div>
        </>
      )}

      {!loading && !info?.ok && (
        <>
          <p className="text-red-600">We couldn’t verify your payment.</p>
          {info?.error && <p className="text-gray-500 mt-1">{info.error}</p>}
          <div className="mt-4">
            <Link href="/explore" className="border rounded-xl px-4 py-2 hover:bg-gray-50">
              Back to Explore
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
