'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

/** A2HS prompt nudge (inlined) */
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

  useEffect(() => {
    const action = sp.get('action'); // 'accept' | 'decline'
    const bookingId = sp.get('booking');

    if (!action || !bookingId) return;
    if (processed.current) return;
    if (!ownerId) return; // wait until we know who the owner is

    processed.current = true;

    (async () => {
      try {
        // must be logged in and be the owner
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

        if (action !== 'accept' && action !== 'decline') {
          toast.error('Unknown action.');
          return;
        }

        // Verify booking belongs to this tag (defensive)
        const { data: booking, error: fetchErr } = await supabase
          .from('bookings')
          .select('id, status, tag_id')
          .eq('id', bookingId)
          .single();

        if (fetchErr || !booking) {
          console.error('Fetch booking error:', fetchErr);
          toast.error('Booking not found.');
          return;
        }
        if (booking.tag_id !== cleanId) {
          toast.error('This booking does not belong to this tag.');
          return;
        }

        const nextStatus = action === 'accept' ? 'accepted' : 'declined';
        if (booking.status === nextStatus) {
          toast('This booking is already ' + nextStatus + '.');
          return;
        }

        const { error: updateErr } = await supabase
          .from('bookings')
          .update({ status: nextStatus })
          .eq('id', booking.id);

        if (updateErr) {
          console.error('Update booking error:', updateErr);
          toast.error('Could not update booking. Try again.');
          return;
        }

        toast.success(nextStatus === 'accepted' ? '✅ Booking accepted.' : '❌ Booking declined.');
        // Edge Function will email the requester on UPDATE
      } catch (e) {
        console.error(e);
        toast.error('Something went wrong.');
      } finally {
        // Clean query params so refresh doesn't re-run
        const url = new URL(window.location.href);
        url.searchParams.delete('action');
        url.searchParams.delete('booking');
        router.replace(
          url.pathname + (url.search ? `?${url.searchParams.toString()}` : ''),
          { scroll: false }
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, ownerId]);

  return null;
}

export default function TagClient({ tagId, scanChartData }: Props) {
  // Use the id exactly as provided in the URL (decode only; do not strip spaces)
  const cleanId = useMemo(() => decodeURIComponent(tagId || '').trim(), [tagId]);
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://omninethq.co.uk';
  const tagUrl = `${origin}/tag/${encodeURIComponent(cleanId)}`;

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

  // Early guard for placeholder/bad IDs
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
        .maybeSingle(); // avoids 406 when not found

      if (error) {
        setError(error.message);
      } else {
        setData(data);
        if (data) {
          // increment views; ignore errors quietly
          const { error: incErr } = await supabase.rpc('increment_views', { row_id: cleanId });
          if (incErr) console.warn('increment_views error:', incErr.message);
        }
      }
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
      // let server default set created_at; ignore errors (e.g., strict RLS)
      const { error: insErr } = await supabase.from('scans').insert([{ tag_id: cleanId }]);
      if (insErr) console.warn('scan insert error:', insErr.message);

      const { count, error: cntErr } = await supabase
        .from('scans')
        .select('*', { count: 'exact', head: true })
        .eq('tag_id', cleanId);
      if (!cntErr) setScanCount(count || 0);
    };

    fetchTag();
    fetchFeedback();
    getUser();
    logScan();
  }, [cleanId]);

  const isOwner = userId && data?.user_id && userId === data.user_id;

  // Process Accept/Decline actions from email (owner only)
  const ownerId = data?.user_id as string | undefined;
  // ts-expect-error server/client boundary – used only in client
  const EmailAction = <EmailActionProcessor cleanId={cleanId} ownerId={ownerId} />;

  // Stripe checkout
  async function startCheckout(id: string, amountCents = 500) {
    try {
      const refCode =
        (typeof window !== 'undefined' && localStorage.getItem('referral_code')) || '';

      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId: id, refCode, amountCents }),
      });

      const { url, error } = await res.json();
      if (error) {
        console.error(error);
        toast.error('❌ Failed to create Stripe session');
        return;
      }
      if (url) {
        window.location.href = url;
      } else {
        toast.error('❌ No checkout URL returned');
      }
    } catch (e) {
      console.error(e);
      toast.error('❌ Could not start checkout');
    }
  }

  const handleDownload = async () => {
    if (!qrRef.current) return;
    const dataUrl = await toPng(qrRef.current);
    const link = document.createElement('a');
    link.download = `${cleanId}-qr.png`;
    link.href = dataUrl;
    link.click();
    toast.success('📥 QR code downloaded!');
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(tagUrl);
    toast.success('🔗 Link copied to clipboard!');
  };

  const handleShare = async () => {
    try {
      const title = typeof document !== 'undefined' ? document.title : 'OmniNet Tag';
      const url = typeof window !== 'undefined' ? window.location.href : tagUrl;
      const shareData = { title, url };

      if (typeof navigator !== 'undefined' && 'share' in navigator && (navigator as any).share) {
        try {
          await (navigator as any).share(shareData);
          return;
        } catch {
          return;
        }
      }

      await navigator.clipboard.writeText(shareData.url);
      toast.success('🔗 Link copied to clipboard!');
    } catch {
      toast.error('❌ Could not share right now');
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === '' || Number.isNaN(rating)) {
      toast.error('Please select a rating.');
      return;
    }
    const { error } = await supabase.from('feedback').insert([
      {
        tag_id: cleanId,
        name: name || 'Anonymous',
        message,
        rating,
      },
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
    } else {
      toast.error('❌ Failed to submit feedback');
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    if (!confirm('Are you sure you want to hide this comment?')) return;
    const { error } = await supabase.from('feedback').update({ hidden: true }).eq('id', id);
    if (!error) {
      setFeedback((prev) => prev.filter((f) => f.id !== id));
      toast.success('🗑 Feedback hidden');
    } else {
      toast.error('❌ Failed to hide feedback');
    }
  };

  const getCategoryBadge = (category: string) => {
    const base = 'inline-block px-3 py-1 rounded-full text-xs font-medium';
    switch (category) {
      case 'rent':
        return `${base} bg-blue-100 text-blue-800`;
      case 'sell':
        return `${base} bg-green-100 text-green-800`;
      case 'teach':
        return `${base} bg-yellow-100 text-yellow-800`;
      case 'help':
        return `${base} bg-purple-100 text-purple-800`;
      default:
        return `${base} bg-gray-100 text-gray-800`;
    }
  };

  const getCategoryEmoji = (category: string) => {
    switch (category) {
      case 'rent':
        return '🪜';
      case 'sell':
        return '🛒';
      case 'teach':
        return '🎓';
      case 'help':
        return '🤝';
      default:
        return '';
    }
  };

  const averageRating = feedback.length
    ? (feedback.reduce((sum, f) => sum + (f.rating || 0), 0) / feedback.length).toFixed(1)
    : null;

  if (error || !data) {
    return (
      <div className="p-10 text-center text-red-600">
        <h1 className="text-2xl font-bold">Tag Not Found</h1>
        <p>ID: {cleanId}</p>
      </div>
    );
  }

  return (
    <div className="p-10 text-center">
      <Toaster position="top-center" />
      <A2HSNudge />
      {/* Process accept/decline from email (owner only) */}
      {EmailAction}
      <BackButton />

      <h1 className="text-3xl font-bold mb-2">{data.title}</h1>

      {/* Owner toggle for bookings */}
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
        <span className={getCategoryBadge(data.category)}>
          {getCategoryEmoji(data.category)} {data.category}
        </span>
      </Link>

      <p className="text-sm text-gray-400 mt-4 mb-1">Tag ID: {cleanId}</p>
      <p className="text-xs text-gray-500 mb-1">🔢 {scanCount} scans</p>

      {typeof data.views === 'number' && (
        <p className="text-xs text-gray-500 mb-4">👁️ {data.views} views</p>
      )}

      <div className="flex flex-col items-center gap-3 mb-8">
        <div ref={qrRef} className="bg-white p-3 rounded shadow">
          <QRCode value={tagUrl} size={160} level="H" />
        </div>

        <p className="text-sm text-gray-500">📱 Scan this QR to view this tag instantly</p>

        <div className="flex flex-wrap justify-center gap-3 mt-2">
          <button
            onClick={handleDownload}
            className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition text-sm"
          >
            📥 Download QR
          </button>

          <button
            onClick={handleCopyLink}
            className="bg-gray-200 text-black px-4 py-2 rounded hover:bg-gray-300 transition text-sm"
          >
            🔗 Copy Link
          </button>

          <button
            onClick={handleShare}
            className="rounded-xl border px-4 py-2 transition text-sm hover:bg-gray-50"
          >
            📣 Share
          </button>

          <Link
            href={`/tag/${encodeURIComponent(cleanId)}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border px-4 py-2 transition text-sm hover:bg-gray-50"
          >
            🖨️ Print QR
          </Link>

          <button
            onClick={() => startCheckout(cleanId, 500)}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition text-sm"
          >
            💸 Support this Tag
          </button>
        </div>
      </div>

      <ScanAnalytics data={scanChartData} />

      {/* Booking Section */}
      <hr className="my-8 border-gray-300" />
      <h2 className="text-xl font-semibold mb-4">📅 Booking</h2>
      <BookingRequestForm tagId={cleanId} enabled={!!data.bookings_enabled} />

      {/* Owner’s list of requests */}
      {isOwner && <BookingRequestsList tagId={cleanId} ownerId={data.user_id} />}

      {/* Feedback Section */}
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


