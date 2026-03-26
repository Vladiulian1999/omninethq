'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { BackButton } from '@/components/BackButton';

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
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type BlockFormState = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  timezone: string;
  capacityTotal: string;
  priceText: string;
  currency: string;
  status: BlockStatus;
  actionType: ActionType;
  visibility: Visibility;
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

function toDatetimeLocal(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

function isAutoStarter(meta: Record<string, unknown> | null) {
  return Boolean(meta && meta.autoStarter === true);
}

function isLiveNow(block: AvailabilityBlock) {
  if (block.status !== 'live') return false;

  const now = Date.now();
  const start = block.start_at ? new Date(block.start_at).getTime() : null;
  const end = block.end_at ? new Date(block.end_at).getTime() : null;

  if (start && now < start) return false;
  if (end && now > end) return false;

  return true;
}

function isScheduled(block: AvailabilityBlock) {
  if (block.status !== 'live') return false;
  if (!block.start_at) return false;
  return new Date(block.start_at).getTime() > Date.now();
}

function timeUntil(start: string) {
  const diff = new Date(start).getTime() - Date.now();
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return 'starting now';
  if (mins < 60) return `starts in ${mins} min`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `starts in ${hours}h`;

  const days = Math.floor(hours / 24);
  return `starts in ${days}d`;
}

function formFromBlock(b: AvailabilityBlock): BlockFormState {
  return {
    title: b.title ?? '',
    description: b.description ?? '',
    startAt: toDatetimeLocal(b.start_at),
    endAt: toDatetimeLocal(b.end_at),
    timezone: b.timezone || 'Europe/London',
    capacityTotal: b.capacity_total == null ? '' : String(b.capacity_total),
    priceText: b.price_pence == null ? '' : String(b.price_pence / 100),
    currency: b.currency || 'GBP',
    status: b.status,
    actionType: b.action_type,
    visibility: b.visibility,
  };
}

function validateForm(form: BlockFormState) {
  const title = form.title.trim();
  if (!title) return 'Title is required.';

  const startISO = form.startAt ? new Date(form.startAt).toISOString() : null;
  const endISO = form.endAt ? new Date(form.endAt).toISOString() : null;

  if (!startISO && endISO) return 'Set a start time if you set an end time.';

  if (form.status === 'live') {
    if (!startISO || !endISO) {
      return 'Live availability requires both start and end time.';
    }
  }

  if (startISO && endISO && new Date(endISO).getTime() <= new Date(startISO).getTime()) {
    return 'End time must be after start time.';
  }

  const total = clampInt(form.capacityTotal);
  if (form.capacityTotal.trim() !== '' && total == null) {
    return 'Capacity must be a whole number or blank for unlimited.';
  }

  const price = penceFromText(form.priceText);
  if (form.priceText.trim() !== '' && price == null) {
    return 'Price must be a valid non-negative number.';
  }

  return null;
}

function patchFromForm(form: BlockFormState): Partial<AvailabilityBlock> {
  const total = clampInt(form.capacityTotal);
  const isUnlimited = total == null;
  const pence = penceFromText(form.priceText);

  const startISO = form.startAt ? new Date(form.startAt).toISOString() : null;
  const endISO = form.endAt ? new Date(form.endAt).toISOString() : null;

  return {
    title: form.title.trim(),
    description: form.description.trim() ? form.description.trim() : null,
    start_at: startISO,
    end_at: endISO,
    timezone: form.timezone.trim() || 'Europe/London',
    status: form.status,
    action_type: form.actionType,
    visibility: form.visibility,
    price_pence: pence,
    currency: form.currency || 'GBP',
    capacity_total: isUnlimited ? null : total,
    capacity_remaining: isUnlimited ? null : total,
  };
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

  const [showAddForm, setShowAddForm] = useState(false);

  const [newForm, setNewForm] = useState<BlockFormState>({
    title: '',
    description: '',
    startAt: '',
    endAt: '',
    timezone: 'Europe/London',
    capacityTotal: '',
    priceText: '',
    currency: 'GBP',
    status: 'live',
    actionType: 'reserve',
    visibility: 'public',
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<BlockFormState | null>(null);

  async function loadAll() {
    if (!tagId) return;
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id ?? null;
    setSessionUserId(uid);

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

  async function pauseOtherLiveBlocks(exceptId?: string) {
    if (!tagId) return { error: null as string | null };

    let query = supabase
      .from('availability_blocks')
      .update({ status: 'paused' })
      .eq('tag_id', tagId)
      .eq('status', 'live');

    if (exceptId) {
      query = query.neq('id', exceptId);
    }

    const { error } = await query;
    return { error: error?.message ?? null };
  }

  function startEditing(block: AvailabilityBlock) {
    setEditingId(block.id);
    setEditForm(formFromBlock(block));
  }

  function cancelEditing() {
    setEditingId(null);
    setEditForm(null);
  }

  async function createBlock() {
    if (!tagId) return;

    if (!sessionUserId || !isUuid(sessionUserId)) {
      toast.error('Invalid session. Please log out and log back in.');
      router.push('/login');
      return;
    }

    const validationError = validateForm(newForm);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);

    if (newForm.status === 'live') {
      const pauseResult = await pauseOtherLiveBlocks();
      if (pauseResult.error) {
        setSaving(false);
        toast.error(`Could not prepare the tag for a new live block: ${pauseResult.error}`);
        return;
      }
    }

    const patch = patchFromForm(newForm);

    const payload: Partial<AvailabilityBlock> & {
      tag_id: string;
      owner_id: string;
      title: string;
    } = {
      tag_id: tagId,
      owner_id: sessionUserId,
      title: patch.title as string,
      description: patch.description ?? null,
      start_at: patch.start_at ?? null,
      end_at: patch.end_at ?? null,
      timezone: patch.timezone as string,
      status: patch.status as BlockStatus,
      action_type: patch.action_type as ActionType,
      visibility: patch.visibility as Visibility,
      price_pence: patch.price_pence ?? null,
      currency: patch.currency as string,
      sort_rank: 0,
      capacity_total: patch.capacity_total ?? null,
      capacity_remaining: patch.capacity_remaining ?? null,
      meta: null,
    };

    const { error } = await supabase.from('availability_blocks').insert(payload);

    setSaving(false);

    if (error) {
      console.error(error);
      toast.error(error.message || 'Failed to create block.');
      return;
    }

    const futureLive =
      newForm.status === 'live' &&
      !!newForm.startAt &&
      new Date(newForm.startAt).getTime() > Date.now();

    toast.success(
      futureLive
        ? 'Availability added. It is scheduled for later and will only appear in Explore when its time starts.'
        : newForm.status === 'live'
          ? 'Availability added. Other live blocks were paused.'
          : 'Availability added.'
    );

    setNewForm({
      title: '',
      description: '',
      startAt: '',
      endAt: '',
      timezone: 'Europe/London',
      capacityTotal: '',
      priceText: '',
      currency: 'GBP',
      status: 'live',
      actionType: 'reserve',
      visibility: 'public',
    });

    setShowAddForm(false);
    await loadAll();
  }

  async function saveEdit(blockId: string) {
    if (!editForm) return;

    const validationError = validateForm(editForm);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);

    if (editForm.status === 'live') {
      const pauseResult = await pauseOtherLiveBlocks(blockId);
      if (pauseResult.error) {
        setSaving(false);
        toast.error(`Could not prepare the tag for this live block: ${pauseResult.error}`);
        return;
      }
    }

    const patch = patchFromForm(editForm);

    const { error } = await supabase
      .from('availability_blocks')
      .update(patch)
      .eq('id', blockId);

    setSaving(false);

    if (error) {
      console.error(error);
      toast.error(error.message || 'Save failed.');
      return;
    }

    const futureLive =
      editForm.status === 'live' &&
      !!editForm.startAt &&
      new Date(editForm.startAt).getTime() > Date.now();

    toast.success(
      futureLive
        ? 'Availability updated. It is scheduled for later and will only appear in Explore when its time starts.'
        : 'Availability updated.'
    );

    setEditingId(null);
    setEditForm(null);
    await loadAll();
  }

  async function quickStatusChange(id: string, nextStatus: BlockStatus) {
    setSaving(true);

    if (nextStatus === 'live') {
      const pauseResult = await pauseOtherLiveBlocks(id);
      if (pauseResult.error) {
        setSaving(false);
        toast.error(`Could not prepare the tag for this live block: ${pauseResult.error}`);
        return;
      }
    }

    const { error } = await supabase
      .from('availability_blocks')
      .update({ status: nextStatus })
      .eq('id', id);

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

    if (!error) {
      setSaving(false);
      toast.success('Deleted.');
      await loadAll();
      return;
    }

    const message = error.message || 'Delete failed.';

    if (
      message.includes('analytics_events_block_id_fkey') ||
      message.includes('violates foreign key constraint')
    ) {
      const { error: pauseError } = await supabase
        .from('availability_blocks')
        .update({ status: 'paused' })
        .eq('id', id);

      setSaving(false);

      if (pauseError) {
        console.error(pauseError);
        toast.error('This block has activity and cannot be deleted. Auto-pause also failed.');
        return;
      }

      toast.success('This block had activity, so it was paused instead of deleted.');
      await loadAll();
      return;
    }

    setSaving(false);
    console.error(error);
    toast.error(message);
  }

  async function duplicateBlock(b: AvailabilityBlock) {
    if (!tagId || !sessionUserId) return;

    if (!isUuid(sessionUserId)) {
      toast.error('Invalid session. Please log out and log back in.');
      router.push('/login');
      return;
    }

    setSaving(true);

    const copy: Partial<AvailabilityBlock> & {
      tag_id: string;
      owner_id: string;
      title: string;
    } = {
      tag_id: b.tag_id,
      owner_id: sessionUserId,
      title: `${b.title} (copy)`,
      description: b.description,
      start_at: b.start_at,
      end_at: b.end_at,
      timezone: b.timezone ?? 'Europe/London',
      status: 'draft',
      action_type: b.action_type,
      visibility: b.visibility,
      price_pence: b.price_pence,
      currency: b.currency ?? 'GBP',
      sort_rank: b.sort_rank,
      meta: null,
      capacity_total: b.capacity_total,
      capacity_remaining: b.capacity_total == null ? null : b.capacity_total,
    };

    const { error } = await supabase.from('availability_blocks').insert(copy);

    setSaving(false);

    if (error) {
      console.error(error);
      toast.error(error.message || 'Duplicate failed.');
      return;
    }

    toast.success('Duplicated as draft.');
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

      <div className="mb-4">
        <BackButton />
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold">Manage availability</h1>
          <p className="text-sm opacity-80 mt-1">
            Edit the availability you already have. Add another one only if you genuinely need a second slot or a different context.
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

      <div className="rounded-2xl border p-4 sm:p-6 mb-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Add another availability</h2>
            <p className="text-sm opacity-80 mt-1">
              Only use this if this tag needs an extra slot, offer, or time window.
            </p>
          </div>

          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="px-4 py-2 rounded-xl border hover:opacity-80"
          >
            {showAddForm ? 'Hide' : 'Add another'}
          </button>
        </div>

        {showAddForm && (
          <div className="mt-5">
            <BlockEditorFields form={newForm} setForm={setNewForm} />

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={createBlock}
                disabled={saving || loading}
                className="px-4 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-50"
              >
                Add
              </button>
              <p className="text-xs opacity-70">
                If you save this as live, any other live block for this tag will be paused first.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-8">
        <Section
          title="Always available"
          subtitle="No time window. Useful for walk-ins, open orders, enquiries, etc."
          blocks={grouped.always}
          editingId={editingId}
          editForm={editForm}
          setEditForm={setEditForm}
          onStartEdit={startEditing}
          onCancelEdit={cancelEditing}
          onSaveEdit={saveEdit}
          onQuickStatusChange={quickStatusChange}
          onDelete={deleteBlock}
          onDuplicate={duplicateBlock}
          saving={saving}
        />

        <Section
          title="Upcoming"
          subtitle="Time-based availability such as slots, offers, or limited windows."
          blocks={grouped.upcoming}
          editingId={editingId}
          editForm={editForm}
          setEditForm={setEditForm}
          onStartEdit={startEditing}
          onCancelEdit={cancelEditing}
          onSaveEdit={saveEdit}
          onQuickStatusChange={quickStatusChange}
          onDelete={deleteBlock}
          onDuplicate={duplicateBlock}
          saving={saving}
        />

        <Section
          title="Past / ended"
          subtitle="Not public if end time has passed, even if status was not updated."
          blocks={grouped.pastish}
          editingId={editingId}
          editForm={editForm}
          setEditForm={setEditForm}
          onStartEdit={startEditing}
          onCancelEdit={cancelEditing}
          onSaveEdit={saveEdit}
          onQuickStatusChange={quickStatusChange}
          onDelete={deleteBlock}
          onDuplicate={duplicateBlock}
          saving={saving}
          muted
        />
      </div>

      {loading && <div className="mt-8 text-sm opacity-70">Loading…</div>}
    </div>
  );
}

function BlockEditorFields(props: {
  form: BlockFormState;
  setForm: React.Dispatch<React.SetStateAction<BlockFormState>>;
}) {
  const { form, setForm } = props;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2">
        <label className="text-sm opacity-80">Title</label>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent"
          placeholder="e.g. Lunch special, tutoring slot, haircut booking"
        />
      </div>

      <div className="sm:col-span-2">
        <label className="text-sm opacity-80">Description (optional)</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent min-h-[90px]"
          placeholder="Optional details"
        />
      </div>

      <div>
        <label className="text-sm opacity-80">Action</label>
        <select
          value={form.actionType}
          onChange={(e) => setForm((f) => ({ ...f, actionType: e.target.value as ActionType }))}
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
          value={form.visibility}
          onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value as Visibility }))}
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
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as BlockStatus }))}
          className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent"
        >
          <option value="live">Live</option>
          <option value="draft">Draft</option>
          <option value="paused">Paused</option>
          <option value="sold_out">Sold out</option>
        </select>
      </div>

      <div>
        <label className="text-sm opacity-80">Timezone</label>
        <input
          value={form.timezone}
          onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
          className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent"
          placeholder="Europe/London"
        />
      </div>

      <div>
        <label className="text-sm opacity-80">
          Start {form.status === 'live' ? '(required for live)' : '(optional)'}
        </label>
        <input
          type="datetime-local"
          value={form.startAt}
          onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
          className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent"
        />
      </div>

      <div>
        <label className="text-sm opacity-80">
          End {form.status === 'live' ? '(required for live)' : '(optional)'}
        </label>
        <input
          type="datetime-local"
          value={form.endAt}
          onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
          className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent"
        />
      </div>

      <div>
        <label className="text-sm opacity-80">Capacity (blank = unlimited)</label>
        <input
          value={form.capacityTotal}
          onChange={(e) => setForm((f) => ({ ...f, capacityTotal: e.target.value }))}
          className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent"
          placeholder="e.g. 10"
          inputMode="numeric"
        />
      </div>

      <div>
        <label className="text-sm opacity-80">Price (optional)</label>
        <div className="flex gap-2">
          <input
            value={form.priceText}
            onChange={(e) => setForm((f) => ({ ...f, priceText: e.target.value }))}
            className="mt-1 w-full px-3 py-2 rounded-xl border bg-transparent"
            placeholder="e.g. 25"
            inputMode="decimal"
          />
          <select
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
            className="mt-1 px-3 py-2 rounded-xl border bg-transparent"
          >
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function Section(props: {
  title: string;
  subtitle?: string;
  blocks: AvailabilityBlock[];
  editingId: string | null;
  editForm: BlockFormState | null;
  setEditForm: React.Dispatch<React.SetStateAction<BlockFormState | null>>;
  onStartEdit: (b: AvailabilityBlock) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => Promise<void>;
  onQuickStatusChange: (id: string, nextStatus: BlockStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (b: AvailabilityBlock) => Promise<void>;
  saving: boolean;
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
            <BlockCard
              key={b.id}
              b={b}
              editing={props.editingId === b.id}
              editForm={props.editingId === b.id ? props.editForm : null}
              setEditForm={props.setEditForm}
              onStartEdit={props.onStartEdit}
              onCancelEdit={props.onCancelEdit}
              onSaveEdit={props.onSaveEdit}
              onQuickStatusChange={props.onQuickStatusChange}
              onDelete={props.onDelete}
              onDuplicate={props.onDuplicate}
              saving={props.saving}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BlockCard(props: {
  b: AvailabilityBlock;
  editing: boolean;
  editForm: BlockFormState | null;
  setEditForm: React.Dispatch<React.SetStateAction<BlockFormState | null>>;
  onStartEdit: (b: AvailabilityBlock) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => Promise<void>;
  onQuickStatusChange: (id: string, nextStatus: BlockStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (b: AvailabilityBlock) => Promise<void>;
  saving: boolean;
}) {
  const {
    b,
    editing,
    editForm,
    setEditForm,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onQuickStatusChange,
    onDelete,
    onDuplicate,
    saving,
  } = props;

  const money = fmtMoney(b.price_pence, b.currency);
  const start = fmtDT(b.start_at);
  const end = fmtDT(b.end_at);
  const cap = b.capacity_total == null ? 'Unlimited' : `${b.capacity_remaining ?? 0}/${b.capacity_total}`;
  const starter = isAutoStarter(b.meta);
  const liveNow = isLiveNow(b);
  const scheduled = isScheduled(b);

  const isSoldOut =
    b.status === 'sold_out' || (b.capacity_total != null && (b.capacity_remaining ?? 0) === 0);

  return (
    <div className="rounded-2xl border p-4">
      {!editing ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[240px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">{b.title}</h3>
              <span className="text-xs px-2 py-1 rounded-full border opacity-80">{b.status}</span>
              <span className="text-xs px-2 py-1 rounded-full border opacity-80">{b.action_type}</span>
              <span className="text-xs px-2 py-1 rounded-full border opacity-80">{b.visibility}</span>

              {starter && (
                <span className="text-xs px-2 py-1 rounded-full border opacity-80">
                  starter
                </span>
              )}

              {liveNow && (
                <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                  LIVE NOW
                </span>
              )}

              {scheduled && b.start_at && (
                <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                  SCHEDULED · {timeUntil(b.start_at)}
                </span>
              )}
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
              onClick={() => onStartEdit(b)}
              className="px-3 py-2 rounded-xl border hover:opacity-80"
              disabled={saving}
            >
              Edit
            </button>

            <button
              onClick={() => onQuickStatusChange(b.id, b.status === 'live' ? 'paused' : 'live')}
              className="px-3 py-2 rounded-xl border hover:opacity-80"
              disabled={saving}
            >
              {b.status === 'live' ? 'Pause' : 'Go live'}
            </button>

            <button
              onClick={() => onQuickStatusChange(b.id, 'sold_out')}
              className="px-3 py-2 rounded-xl border hover:opacity-80"
              disabled={saving}
            >
              Sold out
            </button>

            <button
              onClick={() => onDuplicate(b)}
              className="px-3 py-2 rounded-xl border hover:opacity-80"
              disabled={saving}
            >
              Duplicate
            </button>

            <button
              onClick={() => onDelete(b.id)}
              className="px-3 py-2 rounded-xl border hover:opacity-80"
              disabled={saving}
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <h3 className="font-semibold">Edit availability</h3>
            {starter && (
              <span className="text-xs px-2 py-1 rounded-full border opacity-80">
                starter
              </span>
            )}
          </div>

          {editForm && (
            <BlockEditorFields
              form={editForm}
              setForm={setEditForm as React.Dispatch<React.SetStateAction<BlockFormState>>}
            />
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => onSaveEdit(b.id)}
              className="px-4 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-50"
              disabled={saving}
            >
              Save changes
            </button>

            <button
              onClick={onCancelEdit}
              className="px-4 py-2 rounded-xl border hover:opacity-80"
              disabled={saving}
            >
              Cancel
            </button>
          </div>

          <p className="text-xs opacity-70 mt-3">
            Saving this block as live will pause any other live block for this tag.
          </p>
        </div>
      )}
    </div>
  );
}