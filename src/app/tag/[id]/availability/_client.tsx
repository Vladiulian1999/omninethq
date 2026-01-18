'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import { getSupabaseBrowser } from '@/lib/supabase-browser';


type BlockStatus = 'draft' | 'live' | 'paused' | 'sold_out' | 'expired';
type ActionType = 'book' | 'order' | 'reserve' | 'enquire' | 'pay';
type Visibility = 'public' | 'unlisted' | 'private';

type AvailabilityBlock = {
  id: string;
  tag_id: string;
  owner_id: string;
  title: string;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  timezone: string;
  capacity_total: number | null;
  capacity_remaining: number | null;
  status: BlockStatus;
  action_type: ActionType;
  price_pence: number | null;
  currency: string;
  visibility: Visibility;
  sort_rank: number;
  meta: any | null;
  created_at: string;
  updated_at: string;
};

function fmtMoney(pence: number | null, currency: string) {
  if (pence == null) return null;
  const amount = pence / 100;
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function fmtDT(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function clampInt(v: string) {
  if (v.trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function penceFromText(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export default function AvailabilityClient() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const tagId = params?.id;

  const [loading, setLoading] = useState(true);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [saving, setSaving] = useState(false);

  // Create form (fast minimal)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [actionType, setActionType] = useState<ActionType>('book');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [status, setStatus] = useState<BlockStatus>('live');
  const [startAt, setStartAt] = useState<string>(''); // datetime-local string
  const [endAt, setEndAt] = useState<string>('');
  const [timezone, setTimezone] = useState('Europe/London');
  const [capacityTotal, setCapacityTotal] = useState<string>(''); // blank => unlimited
  const [priceText, setPriceText] = useState<string>(''); // in pounds
  const [currency, setCurrency] = useState('GBP');

  async function loadAll() {
    if (!tagId) return;
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id ?? null;
    setSessionUserId(uid);

    // Owner-only page: if no session, bounce.
    if (!uid) {
      toast.error('You must be logged in to manage availability.');
      router.push('/login');
      return;
    }

    if (!isUuid(uid)) {
      toast.error('Invalid session. Please log out and log back in.');
      router.push('/login');
      return;
    }

    const { data, error } = await supabase
      .from('availability_blocks')
      .select('*')
      .eq('tag_id', tagId)
      .order('sort_rank', { ascending: false })
      .order('start_at', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      toast.error('Failed to load availability blocks.');
      setBlocks([]);
      setLoading(false);
      return;
    }

    setBlocks((data ?? []) as AvailabilityBlock[]);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagId]);

  async function createBlock() {
    if (!tagId) return;

    const t = title.trim();
    if (!t) {
      toast.error('Title is required.');
      return;
    }

    // ✅ HARD GUARD: stop uuid errors early
    if (!sessionUserId || !isUuid(sessionUserId)) {
      toast.error('Invalid session. Please log out and log back in.');
      router.push('/login');
      return;
    }

    const total = clampInt(capacityTotal);
    const isUnlimited = total == null;
    const pence = penceFromText(priceText);

    // Convert datetime-local -> ISO; empty -> null
    const startISO = startAt ? new Date(startAt).toISOString() : null;
    const endISO = endAt ? new Date(endAt).toISOString() : null;

    if (!startISO && endISO) {
      toast.error('Set a start time if you set an end time.');
      return;
    }

    setSaving(true);

    const payload: Partial<AvailabilityBlock> & {
      tag_id: string;
      owner_id: string;
      title: string;
    } = {
      tag_id: tagId,
       owner_id: sessionUserId, // ✅ guaranteed uuid
      title: t,
      description: description.trim() ? description.trim() : null,
      start_at: startISO,
      end_at: endISO,
      timezone,
      status,
      action_type: actionType,
      visibility,
      price_pence: pence,
      currency,
      sort_rank: 0,
      capacity_total: isUnlimited ? null : total,
      capacity_remaining: isUnlimited ? null : total,
      meta: null,
    };

    const { error } = await supabase.from('availability_blocks').insert(payload);

    setSaving(false);

    if (error) {
      console.error(error);
      toast.error(error.message || 'Failed to create block.');
      return;
    }

    toast.success('Availability added.');
    setTitle('');
    setDescription('');
    setStartAt('');
    setEndAt('');
    setCapacityTotal('');
    setPriceText('');
    await loadAll();
  }

  async function updateBlock(id: string, patch: Partial<AvailabilityBlock>) {
    setSaving(true);
    const { error } = await supabase.from('availability_blocks').update(patch).eq('id', id);
    setSaving(false);

    if (error) {
      console.error(error);
      toast.error(error.message || 'Update failed.');
      return;
    }
    toast.success('Saved.');
    await loadAll();
  }

  async function deleteBlock(id: string) {
    const ok = window.confirm('Delete this availability block? This cannot be undone.');
    if (!ok) return;

    setSaving(true);
    const { error } = await supabase.from('availability_blocks').delete().eq('id', id);
    setSaving(false);

    if (error) {
      console.error(error);
      toast.error(error.message || 'Delete failed.');
      return;
    }
    toast.success('Deleted.');
    await loadAll();
  }

  async function duplicateBlock(b: AvailabilityBlock) {
    if (!tagId || !sessionUserId) return;

    if (!isUuid(sessionUserId)) {
      toast.error('Invalid session. Please log out and log back in.');
      router.push('/login');
      return;
    }

    setSaving(true);

    const copy: any = {
      tag_id: b.tag_id,
       owner_id: sessionUserId,
      title: `${b.title} (copy)`,
      description: b.description,
      start_at: b.start_at,
      end_at: b.end_at,
      timezone: b.timezone ?? 'Europe/London',
      status: 'draft' as BlockStatus,
      action_type: b.action_type,
      visibility: b.visibility,
      price_pence: b.price_pence,
      currency: b.currency ?? 'GBP',
      sort_rank: b.sort_rank,
      meta: b.meta ?? null,
      capacity_total: b.capacity_total,
      capacity_remaining: b.capacity_total == null ? null : b.capacity_total, // reset remaining
    };

    const { error } = await supabase.from('availability_blocks').insert(copy);

    setSaving(false);

    if (error) {
      console.error(error);
      toast.error(error.message || 'Duplicate failed.');
      return;
    }
    toast.success('Duplicated (draft).');
    await loadAll();
  }

  const grouped = useMemo(() => {
    const upcoming: AvailabilityBlock[] = [];
    const always: AvailabilityBlock[] = [];
    const pastish: AvailabilityBlock[] = [];

    const now = Date.now();

    for (const b of blocks) {
      const end = b.end_at ? new Date(b.end_at).getTime() : null;
      const start = b.start_at ? new Date(b.start_at).getTime() : null;

      if (end && end < now) {
        pastish.push(b);
      } else if (!start && !end) {
        always.push(b);
      } else {
        upcoming.push(b);
      }
    }

    upcoming.sort((a, c) => {
      const sa = a.start_at ? new Date(a.start_at).getTime() : 0;
      const sc = c.start_at ? new Date(c.start_at).getTime() : 0;
      if (sa !== sc) return sa - sc;
      return (c.sort_rank ?? 0) - (a.sort_rank ?? 0);
    });

    always.sort((a, c) => (c.sort_rank ?? 0) - (a.sort_rank ?? 0));

    pastish.sort((a, c) => {
      const ea = a.end_at ? new Date(a.end_at).getTime() : 0;
      const ec = c.end_at ? new Date(c.end_at).getTime() : 0;
      return ec - ea;
    });

    return { always, upcoming, pastish };
  }, [blocks]);

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <Toaster />

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold">Availability</h1>
          <p className="text-sm opacity-80 mt-1">
            Add what’s actually available. Keep it simple. The public tag page stays clean.
          </p>
        </div>

        <div className="flex gap-2">
          <Link href={`/tag/${tagId}`} className="px-3 py-2 rounded-xl border hover:opacity-80">
            View Tag
          </Link>
          <button
            onClick={() => loadAll()}
            className="px-3 py-2 rounded-xl border hover:opacity-80"
            disabled={loading || saving}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Create block */}
      <div className="rounded-2xl border p-4 sm:p-6 mb-8">
        <h2 className="text-lg font-semibold mb-3">Add availability</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-sm opacity-80">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Skin fade, Lunch special, Tutoring slot"
              className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-sm opacity-80">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details"
              className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent min-h-[90px]"
            />
          </div>

          <div>
            <label className="text-sm opacity-80">Action</label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as ActionType)}
              className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent"
            >
              <option value="book">Book</option>
              <option value="reserve">Reserve</option>
              <option value="order">Order</option>
              <option value="enquire">Enquire</option>
              <option value="pay">Pay</option>
            </select>
          </div>

          <div>
            <label className="text-sm opacity-80">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent"
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </div>

          <div>
            <label className="text-sm opacity-80">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as BlockStatus)}
              className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent"
            >
              <option value="live">Live</option>
              <option value="draft">Draft</option>
              <option value="paused">Paused</option>
            </select>
          </div>

          <div>
            <label className="text-sm opacity-80">Timezone</label>
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent"
              placeholder="Europe/London"
            />
          </div>

          <div>
            <label className="text-sm opacity-80">Start (optional)</label>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent"
            />
          </div>

          <div>
            <label className="text-sm opacity-80">End (optional)</label>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent"
            />
          </div>

          <div>
            <label className="text-sm opacity-80">Capacity (blank = unlimited)</label>
            <input
              value={capacityTotal}
              onChange={(e) => setCapacityTotal(e.target.value)}
              placeholder="e.g. 10"
              className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent"
              inputMode="numeric"
            />
          </div>

          <div>
            <label className="text-sm opacity-80">Price (optional, in GBP)</label>
            <div className="flex gap-2">
              <input
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                placeholder="e.g. 25"
                className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent"
                inputMode="decimal"
              />
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1 px-3 py-2 rounded-xl border bg-transparent"
              >
                <option value="GBP">GBP</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={createBlock}
            disabled={saving || loading}
            className="px-4 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-50"
          >
            Add
          </button>
          <p className="text-xs opacity-70">Keep it minimal. The goal is: update availability fast, not write essays.</p>
        </div>
      </div>

      {/* Blocks list */}
      <div className="space-y-8">
        <Section
          title="Always available"
          subtitle="No time window. Useful for ‘walk-ins’, ‘open orders’, ‘enquire’, etc."
          blocks={grouped.always}
          onUpdate={updateBlock}
          onDelete={deleteBlock}
          onDuplicate={duplicateBlock}
        />

        <Section
          title="Upcoming"
          subtitle="Time-based availability (next slots / specials)."
          blocks={grouped.upcoming}
          onUpdate={updateBlock}
          onDelete={deleteBlock}
          onDuplicate={duplicateBlock}
        />

        <Section
          title="Past / ended"
          subtitle="Not public if end time has passed (even if status wasn’t updated)."
          blocks={grouped.pastish}
          onUpdate={updateBlock}
          onDelete={deleteBlock}
          onDuplicate={duplicateBlock}
          muted
        />
      </div>

      {loading && <div className="mt-8 text-sm opacity-70">Loading…</div>}
    </div>
  );
}

function Section(props: {
  title: string;
  subtitle?: string;
  blocks: AvailabilityBlock[];
  onUpdate: (id: string, patch: Partial<AvailabilityBlock>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (b: AvailabilityBlock) => Promise<void>;
  muted?: boolean;
}) {
  const { title, subtitle, blocks, muted } = props;

  return (
    <div className={muted ? 'opacity-70' : ''}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <p className="text-sm opacity-80 mt-1">{subtitle}</p>}

      {blocks.length === 0 ? (
        <div className="mt-3 text-sm opacity-70">None.</div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3">
          {blocks.map((b) => (
            <BlockCard key={b.id} b={b} onUpdate={props.onUpdate} onDelete={props.onDelete} onDuplicate={props.onDuplicate} />
          ))}
        </div>
      )}
    </div>
  );
}

function BlockCard(props: {
  b: AvailabilityBlock;
  onUpdate: (id: string, patch: Partial<AvailabilityBlock>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (b: AvailabilityBlock) => Promise<void>;
}) {
  const { b, onUpdate, onDelete, onDuplicate } = props;

  const money = fmtMoney(b.price_pence, b.currency);
  const start = fmtDT(b.start_at);
  const end = fmtDT(b.end_at);

  const cap = b.capacity_total == null ? 'Unlimited' : `${b.capacity_remaining ?? 0}/${b.capacity_total}`;

  const isSoldOut =
    b.status === 'sold_out' || (b.capacity_total != null && (b.capacity_remaining ?? 0) === 0);

  return (
    <div className="rounded-2xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[240px]">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{b.title}</h3>
            <span className="text-xs px-2 py-1 rounded-full border opacity-80">{b.status}</span>
            <span className="text-xs px-2 py-1 rounded-full border opacity-80">{b.action_type}</span>
            <span className="text-xs px-2 py-1 rounded-full border opacity-80">{b.visibility}</span>
          </div>

          {b.description && <p className="text-sm opacity-80 mt-1">{b.description}</p>}

          <div className="text-sm opacity-80 mt-2 space-y-1">
            <div>Time: {start ? `${start}${end ? ` → ${end}` : ''}` : 'Always'}</div>
            <div>
              Capacity: {cap}
              {isSoldOut ? ' (sold out)' : ''}
            </div>
            {money && <div>Price: {money}</div>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onUpdate(b.id, { status: b.status === 'live' ? 'paused' : 'live' })}
            className="px-3 py-2 rounded-xl border hover:opacity-80"
          >
            {b.status === 'live' ? 'Pause' : 'Go live'}
          </button>

          <button onClick={() => onUpdate(b.id, { status: 'sold_out' })} className="px-3 py-2 rounded-xl border hover:opacity-80">
            Sold out
          </button>

          <button onClick={() => onDuplicate(b)} className="px-3 py-2 rounded-xl border hover:opacity-80">
            Duplicate
          </button>

          <button onClick={() => onDelete(b.id)} className="px-3 py-2 rounded-xl border hover:opacity-80">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
