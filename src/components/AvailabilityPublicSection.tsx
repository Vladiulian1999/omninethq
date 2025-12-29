'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export type AvailabilityBlockRow = {
  id: string;
  tag_id?: string;
  action_type: 'book' | 'order' | 'reserve' | 'enquire' | 'pay';
  title: string;
  description: string | null;
  price_pence: number | null;
  currency: string | null;
  capacity_total: number | null;
  capacity_remaining: number | null;
  start_at: string | null;
  end_at: string | null;
  // view may include these:
  sort_rank?: number | null;
  created_at?: string | null;
};

export default function AvailabilityPublicSection({
  tagId,
  onAction,
}: {
  tagId: string;
  onAction: (block: AvailabilityBlockRow) => void | Promise<void>;
}) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [blocks, setBlocks] = useState<AvailabilityBlockRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      const { data, error } = await supabase
        .from('public_live_availability')
        .select('*')
        .eq('tag_id', tagId)
        .order('sort_rank', { ascending: false })
        .order('start_at', { ascending: true })
        .order('created_at', { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error(error);
        setBlocks([]);
        setLoading(false);
        return;
      }

      setBlocks((data ?? []) as AvailabilityBlockRow[]);
      setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, [supabase, tagId]);

  const { always, upcoming } = useMemo(() => {
    const a: AvailabilityBlockRow[] = [];
    const u: AvailabilityBlockRow[] = [];
    for (const b of blocks) {
      if (!b.start_at && !b.end_at) a.push(b);
      else u.push(b);
    }
    return { always: a, upcoming: u };
  }, [blocks]);

  const isLimited = (b: AvailabilityBlockRow) => b.capacity_total != null;

  const leftCount = (b: AvailabilityBlockRow) => {
    if (!isLimited(b)) return null;
    const rem = typeof b.capacity_remaining === 'number' ? b.capacity_remaining : 0;
    return Math.max(0, rem);
  };

  const capacityText = (b: AvailabilityBlockRow) => {
    if (!isLimited(b)) return 'Unlimited';
    const left = leftCount(b) ?? 0;
    return left <= 3 ? `Only ${left} left` : `${left} left`;
  };

  const isPaidAction = (t: AvailabilityBlockRow['action_type']) => t === 'pay' || t === 'order';

  const formatMoney = (pence: number | null, currency: string | null) => {
    if (typeof pence !== 'number') return null;
    const amount = pence / 100;
    const cur = (currency || 'GBP').toUpperCase();

    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(amount);
    } catch {
      const sym = cur === 'GBP' ? '£' : '';
      return `${sym}${amount.toFixed(2)}`;
    }
  };

  const labelFor = (b: AvailabilityBlockRow) => {
    const base =
      b.action_type === 'book'
        ? 'Book'
        : b.action_type === 'reserve'
        ? 'Reserve'
        : b.action_type === 'enquire'
        ? 'Enquire'
        : b.action_type === 'order'
        ? 'Order'
        : b.action_type === 'pay'
        ? 'Pay now'
        : 'Open';

    const price = isPaidAction(b.action_type) ? formatMoney(b.price_pence ?? null, b.currency || 'GBP') : null;
    return price ? `${base} · ${price}` : base;
  };

  const fmtFriendly = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((startOfThat.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

    if (diffDays === 0) return `Today ${time}`;
    if (diffDays === 1) return `Tomorrow ${time}`;

    const day = d.toLocaleDateString(undefined, { weekday: 'short' });
    return `${day} ${time}`;
  };

  if (loading) {
    return (
      <div className="mt-6 rounded-2xl border p-4">
        <div className="text-sm opacity-70">Loading availability…</div>
      </div>
    );
  }

  if (!always.length && !upcoming.length) return null;

  const Card = ({ b }: { b: AvailabilityBlockRow }) => {
    const cap = capacityText(b);
    const low = isLimited(b) && (leftCount(b) ?? 0) <= 3;

    const start = fmtFriendly(b.start_at);
    const end = fmtFriendly(b.end_at);

    const money = isPaidAction(b.action_type) ? formatMoney(b.price_pence ?? null, b.currency || 'GBP') : null;

    return (
      <div className="rounded-2xl border p-4 bg-white shadow-sm text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold">{b.title}</div>
            {b.description && <div className="text-sm opacity-80 mt-1">{b.description}</div>}
          </div>

          {money && <div className="text-sm font-semibold whitespace-nowrap">{money}</div>}
        </div>

        {(start || end) && (
          <div className="text-xs opacity-70 mt-2">
            {start || '—'}
            {end ? ` → ${end}` : ''}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className={`text-xs px-2 py-1 rounded-full border ${low ? 'border-black' : ''}`}>{cap}</div>

          <button
            onClick={() => onAction(b)}
            className="px-4 py-2 rounded-2xl bg-black text-white hover:bg-gray-800 transition text-sm"
          >
            {labelFor(b)}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-6 rounded-2xl border p-4 bg-white">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Live availability</h2>
        <div className="text-xs opacity-70 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-green-600" />
          Updated live
        </div>
      </div>

      {always.length > 0 && (
        <div className="mt-4">
          <div className="text-sm font-semibold opacity-80">Available now</div>
          <div className="mt-2 grid gap-3">
            {always.map((b) => (
              <Card key={b.id} b={b} />
            ))}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mt-6">
          <div className="text-sm font-semibold opacity-80">Next</div>
          <div className="mt-2 grid gap-3">
            {upcoming.map((b) => (
              <Card key={b.id} b={b} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
