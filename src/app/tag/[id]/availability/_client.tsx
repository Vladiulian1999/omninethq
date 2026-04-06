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

type AvailabilityClaim = {
  id?: string | null;
  action_id?: string | null;
  block_id?: string | null;
  status?: string | null;
  quantity?: number | null;
  customer_name?: string | null;
  customer_contact?: string | null;
  channel?: string | null;
  referral_code?: string | null;
  meta?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

type NotificationLogRow = {
  id: string;
  type: string | null;
  action_id: string | null;
  status: string | null;
  response: Record<string, unknown> | null;
  created_at: string | null;
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

type ClaimWorkflowState = 'open' | 'contacted' | 'closed';
type ClaimAgeState = 'new' | 'aging' | 'stale';

type AttentionItem = {
  claim: AvailabilityClaim;
  block: AvailabilityBlock;
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

function claimPrimaryId(c: AvailabilityClaim) {
  return String(c.action_id ?? c.id ?? '').trim();
}

function claimDisplayName(c: AvailabilityClaim) {
  const name = String(c.customer_name ?? '').trim();
  const contact = String(c.customer_contact ?? '').trim();
  if (name && contact) return `${name} • ${contact}`;
  if (name) return name;
  if (contact) return contact;
  return 'Anonymous / no contact';
}

function claimQuantity(c: AvailabilityClaim) {
  const q = Number(c.quantity ?? 1);
  if (!Number.isFinite(q) || q < 1) return 1;
  return Math.floor(q);
}

function claimStatus(c: AvailabilityClaim) {
  return String(c.status ?? 'initiated').trim() || 'initiated';
}

function shorten(v: string, n = 8) {
  return v.length > n ? `${v.slice(0, n)}…` : v;
}

function isPhoneLike(v: string) {
  const cleaned = v.replace(/[^\d+]/g, '');
  return cleaned.length >= 7;
}

function phoneHref(v: string) {
  return `tel:${v.replace(/[^\d+]/g, '')}`;
}

function smsHref(v: string) {
  return `sms:${v.replace(/[^\d+]/g, '')}`;
}

function ownerMeta(claim: AvailabilityClaim) {
  return (claim.meta && typeof claim.meta === 'object' ? claim.meta : {}) as Record<string, unknown>;
}

function ownerFlag(claim: AvailabilityClaim, key: string) {
  return Boolean(ownerMeta(claim)[key]);
}

function notificationResponse(log: NotificationLogRow | null | undefined) {
  return (log?.response && typeof log.response === 'object' ? log.response : {}) as Record<string, unknown>;
}

function notificationStatusLabel(status?: string | null) {
  const s = String(status ?? '').trim().toLowerCase();
  if (s === 'sent') return 'NOTIFIED';
  if (s === 'failed') return 'NOTIFY FAILED';
  if (s === 'attempted') return 'NOTIFYING';
  return 'NO STATUS';
}

function notificationBadgeClass(status?: string | null) {
  const s = String(status ?? '').trim().toLowerCase();
  if (s === 'sent') return 'bg-emerald-100 text-emerald-700';
  if (s === 'failed') return 'bg-red-100 text-red-700';
  if (s === 'attempted') return 'bg-amber-100 text-amber-700';
  return 'bg-gray-200 text-gray-700';
}

function providerMessageId(log: NotificationLogRow | null | undefined) {
  const resp = notificationResponse(log);
  const direct = String(resp.provider_message_id ?? '').trim();
  if (direct) return direct;

  const raw = String(resp.resend_body ?? '').trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const id = String(parsed?.id ?? '').trim();
    return id || null;
  } catch {
    return null;
  }
}

function claimWorkflowState(claim: AvailabilityClaim): ClaimWorkflowState {
  const closed = ownerFlag(claim, 'owner_closed');
  if (closed) return 'closed';

  const contacted = ownerFlag(claim, 'owner_contacted');
  if (contacted) return 'contacted';

  return 'open';
}

function workflowLabel(state: ClaimWorkflowState) {
  if (state === 'open') return 'OPEN';
  if (state === 'contacted') return 'CONTACTED';
  return 'CLOSED';
}

function workflowBadgeClass(state: ClaimWorkflowState) {
  if (state === 'open') return 'bg-orange-100 text-orange-700';
  if (state === 'contacted') return 'bg-blue-100 text-blue-700';
  return 'bg-gray-200 text-gray-700';
}

function claimAgeState(claim: AvailabilityClaim): ClaimAgeState {
  const createdAt = String(claim.created_at ?? '').trim();
  if (!createdAt) return 'new';

  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return 'new';

  const ageMs = Date.now() - createdMs;
  if (ageMs >= 60 * 60 * 1000) return 'stale';
  if (ageMs >= 15 * 60 * 1000) return 'aging';
  return 'new';
}

function claimAgeLabel(state: ClaimAgeState) {
  if (state === 'stale') return 'STALE';
  if (state === 'aging') return 'AGING';
  return 'NEW';
}

function claimAgeBadgeClass(state: ClaimAgeState) {
  if (state === 'stale') return 'bg-red-100 text-red-700';
  if (state === 'aging') return 'bg-yellow-100 text-yellow-700';
  return 'bg-emerald-100 text-emerald-700';
}

function claimAgeHelpText(state: ClaimAgeState) {
  if (state === 'stale') return 'Open too long. This is being neglected.';
  if (state === 'aging') return 'Needs attention soon.';
  return 'Fresh claim.';
}

function sortClaimsForWorkflow(claims: AvailabilityClaim[], state: ClaimWorkflowState) {
  return [...claims].sort((a, b) => {
    const aAge = claimAgeState(a);
    const bAge = claimAgeState(b);

    if (state === 'open') {
      const rank = { stale: 0, aging: 1, new: 2 } as const;
      if (rank[aAge] !== rank[bAge]) return rank[aAge] - rank[bAge];
    }

    const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bCreated - aCreated;
  });
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copied.');
  } catch {
    toast.error('Copy failed.');
  }
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
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsByBlock, setClaimsByBlock] = useState<Record<string, AvailabilityClaim[]>>({});
  const [notificationsByActionId, setNotificationsByActionId] = useState<Record<string, NotificationLogRow>>({});
  const [claimSavingId, setClaimSavingId] = useState<string | null>(null);
  const [retryingNotificationLogId, setRetryingNotificationLogId] = useState<string | null>(null);

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

  async function loadNotificationsForClaims(claims: AvailabilityClaim[]) {
    const actionIds = Array.from(
      new Set(
        claims
          .map((c) => String(c.id ?? '').trim())
          .filter(Boolean)
      )
    );

    if (actionIds.length === 0) {
      setNotificationsByActionId({});
      return;
    }

    const { data, error } = await supabase
      .from('notification_logs')
      .select('id, type, action_id, status, response, created_at')
      .eq('type', 'availability_claim')
      .in('action_id', actionIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load notification logs:', error);
      setNotificationsByActionId({});
      return;
    }

    const nextMap: Record<string, NotificationLogRow> = {};
    for (const row of (data ?? []) as NotificationLogRow[]) {
      const actionId = String(row.action_id ?? '').trim();
      if (!actionId) continue;
      if (!nextMap[actionId]) {
        nextMap[actionId] = row;
      }
    }

    setNotificationsByActionId(nextMap);
  }

  async function loadClaims(blockIds: string[]) {
    if (blockIds.length === 0) {
      setClaimsByBlock({});
      setNotificationsByActionId({});
      return;
    }

    setClaimsLoading(true);

    const { data, error } = await supabase
      .from('availability_actions')
      .select('*')
      .in('block_id', blockIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load availability claims:', error);
      setClaimsByBlock({});
      setNotificationsByActionId({});
      setClaimsLoading(false);
      return;
    }

    const claimRows = (data ?? []) as AvailabilityClaim[];

    const grouped: Record<string, AvailabilityClaim[]> = {};
    for (const row of claimRows) {
      const blockId = String(row.block_id ?? '').trim();
      if (!blockId) continue;
      if (!grouped[blockId]) grouped[blockId] = [];
      grouped[blockId].push(row);
    }

    setClaimsByBlock(grouped);
    await loadNotificationsForClaims(claimRows);
    setClaimsLoading(false);
  }

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
      setClaimsByBlock({});
      setNotificationsByActionId({});
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as AvailabilityBlock[];
    setBlocks(rows);
    await loadClaims(rows.map((b) => b.id));
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

  async function updateClaimMeta(claim: AvailabilityClaim, patch: Record<string, unknown>) {
    const id = String(claim.id ?? '').trim();
    if (!id) {
      toast.error('Claim id missing.');
      return;
    }

    setClaimSavingId(id);

    const nextMeta = {
      ...(ownerMeta(claim) || {}),
      ...patch,
      owner_action_updated_at: new Date().toISOString(),
      owner_action_updated_by: sessionUserId,
    };

    const { error } = await supabase
      .from('availability_actions')
      .update({ meta: nextMeta })
      .eq('id', id);

    setClaimSavingId(null);

    if (error) {
      console.error(error);
      toast.error(error.message || 'Failed to update claim.');
      return;
    }

    toast.success('Claim updated.');
    await loadAll();
  }

  async function confirmClaim(claim: AvailabilityClaim) {
    const id = String(claim.id ?? '').trim();
    if (!id) {
      toast.error('Claim id missing.');
      return;
    }

    setClaimSavingId(id);

    const nextMeta = {
      ...(ownerMeta(claim) || {}),
      owner_confirmed_at: new Date().toISOString(),
      owner_confirmed_by: sessionUserId,
    };

    const { error } = await supabase
      .from('availability_actions')
      .update({
        status: 'confirmed',
        meta: nextMeta,
      })
      .eq('id', id);

    setClaimSavingId(null);

    if (error) {
      console.error(error);
      toast.error(error.message || 'Failed to confirm claim.');
      return;
    }

    toast.success('Claim confirmed.');
    await loadAll();
  }

  async function retryNotification(notificationLogId: string) {
    if (!notificationLogId) {
      toast.error('Missing notification log id.');
      return;
    }

    setRetryingNotificationLogId(notificationLogId);

    try {
      const res = await fetch('/api/availability/retry-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationLogId }),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'Retry failed.');
        setRetryingNotificationLogId(null);
        return;
      }

      toast.success('Notification retried.');
      await loadAll();
    } catch (e) {
      console.error(e);
      toast.error('Retry failed.');
    } finally {
      setRetryingNotificationLogId(null);
    }
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

  const needsAttentionNow = useMemo(() => {
    const blockMap = new Map(blocks.map((b) => [b.id, b] as const));

    const allClaims = Object.values(claimsByBlock).flat();

    const items: AttentionItem[] = allClaims
      .filter((claim) => claimWorkflowState(claim) === 'open')
      .filter((claim) => {
        const age = claimAgeState(claim);
        return age === 'stale' || age === 'aging';
      })
      .map((claim) => {
        const blockId = String(claim.block_id ?? '').trim();
        const block = blockMap.get(blockId);
        return block ? { claim, block } : null;
      })
      .filter((item): item is AttentionItem => Boolean(item));

    items.sort((a, b) => {
      const aAge = claimAgeState(a.claim);
      const bAge = claimAgeState(b.claim);
      const rank = { stale: 0, aging: 1, new: 2 } as const;
      if (rank[aAge] !== rank[bAge]) return rank[aAge] - rank[bAge];

      const aCreated = a.claim.created_at ? new Date(a.claim.created_at).getTime() : 0;
      const bCreated = b.claim.created_at ? new Date(b.claim.created_at).getTime() : 0;
      return aCreated - bCreated;
    });

    return items;
  }, [blocks, claimsByBlock]);

  const needsAttentionStaleCount = needsAttentionNow.filter((item) => claimAgeState(item.claim) === 'stale').length;
  const needsAttentionAgingCount = needsAttentionNow.filter((item) => claimAgeState(item.claim) === 'aging').length;

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
            disabled={loading || saving || claimsLoading || !!claimSavingId || !!retryingNotificationLogId}
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

      <div className="mb-6 rounded-2xl border p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Needs attention now</h2>
            <p className="text-sm opacity-80 mt-1">
              This pulls aging and stale open claims from every block into one priority queue so the owner stops scanning blind.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
              Aging {needsAttentionAgingCount}
            </span>
            <span className="px-2 py-1 rounded-full bg-red-100 text-red-700">
              Stale {needsAttentionStaleCount}
            </span>
          </div>
        </div>

        {needsAttentionNow.length === 0 ? (
          <div className="mt-4 rounded-xl border bg-black/[0.02] p-4 text-sm opacity-70">
            Nothing urgent right now.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {needsAttentionNow.map((item, index) => (
              <AttentionClaimCard
                key={`${item.claim.id ?? item.claim.action_id ?? index}`}
                claim={item.claim}
                block={item.block}
                notifyLog={
                  item.claim.id ? notificationsByActionId[String(item.claim.id).trim()] ?? null : null
                }
                claimSavingId={claimSavingId}
                retryingNotificationLogId={retryingNotificationLogId}
                onConfirmClaim={confirmClaim}
                onMarkContacted={(claim) =>
                  updateClaimMeta(claim, {
                    owner_contacted: true,
                    owner_contacted_at: new Date().toISOString(),
                  })
                }
                onMarkClosed={(claim) =>
                  updateClaimMeta(claim, {
                    owner_closed: true,
                    owner_closed_at: new Date().toISOString(),
                  })
                }
                onRetryNotification={retryNotification}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mb-6 rounded-2xl border p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Recent claims visibility</h2>
            <p className="text-sm opacity-80 mt-1">
              Open claims are now flagged as new, aging, or stale so ignored leads stop blending into the pile.
            </p>
          </div>
          <div className="text-xs opacity-70">
            {claimsLoading ? 'Refreshing claims…' : 'Claims, age, and notification status loaded'}
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <Section
          title="Always available"
          subtitle="No time window. Useful for walk-ins, open orders, enquiries, etc."
          blocks={grouped.always}
          claimsByBlock={claimsByBlock}
          notificationsByActionId={notificationsByActionId}
          claimSavingId={claimSavingId}
          retryingNotificationLogId={retryingNotificationLogId}
          editingId={editingId}
          editForm={editForm}
          setEditForm={setEditForm}
          onStartEdit={startEditing}
          onCancelEdit={cancelEditing}
          onSaveEdit={saveEdit}
          onQuickStatusChange={quickStatusChange}
          onDelete={deleteBlock}
          onDuplicate={duplicateBlock}
          onConfirmClaim={confirmClaim}
          onMarkContacted={(claim) =>
            updateClaimMeta(claim, {
              owner_contacted: true,
              owner_contacted_at: new Date().toISOString(),
            })
          }
          onMarkClosed={(claim) =>
            updateClaimMeta(claim, {
              owner_closed: true,
              owner_closed_at: new Date().toISOString(),
            })
          }
          onRetryNotification={retryNotification}
          saving={saving}
        />

        <Section
          title="Upcoming"
          subtitle="Time-based availability such as slots, offers, or limited windows."
          blocks={grouped.upcoming}
          claimsByBlock={claimsByBlock}
          notificationsByActionId={notificationsByActionId}
          claimSavingId={claimSavingId}
          retryingNotificationLogId={retryingNotificationLogId}
          editingId={editingId}
          editForm={editForm}
          setEditForm={setEditForm}
          onStartEdit={startEditing}
          onCancelEdit={cancelEditing}
          onSaveEdit={saveEdit}
          onQuickStatusChange={quickStatusChange}
          onDelete={deleteBlock}
          onDuplicate={duplicateBlock}
          onConfirmClaim={confirmClaim}
          onMarkContacted={(claim) =>
            updateClaimMeta(claim, {
              owner_contacted: true,
              owner_contacted_at: new Date().toISOString(),
            })
          }
          onMarkClosed={(claim) =>
            updateClaimMeta(claim, {
              owner_closed: true,
              owner_closed_at: new Date().toISOString(),
            })
          }
          onRetryNotification={retryNotification}
          saving={saving}
        />

        <Section
          title="Past / ended"
          subtitle="Not public if end time has passed, even if status was not updated."
          blocks={grouped.pastish}
          claimsByBlock={claimsByBlock}
          notificationsByActionId={notificationsByActionId}
          claimSavingId={claimSavingId}
          retryingNotificationLogId={retryingNotificationLogId}
          editingId={editingId}
          editForm={editForm}
          setEditForm={setEditForm}
          onStartEdit={startEditing}
          onCancelEdit={cancelEditing}
          onSaveEdit={saveEdit}
          onQuickStatusChange={quickStatusChange}
          onDelete={deleteBlock}
          onDuplicate={duplicateBlock}
          onConfirmClaim={confirmClaim}
          onMarkContacted={(claim) =>
            updateClaimMeta(claim, {
              owner_contacted: true,
              owner_contacted_at: new Date().toISOString(),
            })
          }
          onMarkClosed={(claim) =>
            updateClaimMeta(claim, {
              owner_closed: true,
              owner_closed_at: new Date().toISOString(),
            })
          }
          onRetryNotification={retryNotification}
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

function AttentionClaimCard(props: {
  claim: AvailabilityClaim;
  block: AvailabilityBlock;
  notifyLog: NotificationLogRow | null;
  claimSavingId: string | null;
  retryingNotificationLogId: string | null;
  onConfirmClaim: (claim: AvailabilityClaim) => Promise<void>;
  onMarkContacted: (claim: AvailabilityClaim) => Promise<void>;
  onMarkClosed: (claim: AvailabilityClaim) => Promise<void>;
  onRetryNotification: (notificationLogId: string) => Promise<void>;
}) {
  const {
    claim,
    block,
    notifyLog,
    claimSavingId,
    retryingNotificationLogId,
    onConfirmClaim,
    onMarkContacted,
    onMarkClosed,
    onRetryNotification,
  } = props;

  const rowId = String(claim.id ?? '').trim();
  const savingThisClaim = claimSavingId === rowId;
  const ageState = claimAgeState(claim);
  const notifyStatus = String(notifyLog?.status ?? '').trim().toLowerCase();
  const retryingThisNotification = retryingNotificationLogId === notifyLog?.id;
  const confirmed = claimStatus(claim) === 'confirmed';
  const contact = String(claim.customer_contact ?? '').trim();

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded-full ${claimAgeBadgeClass(ageState)}`}>
              {claimAgeLabel(ageState)}
            </span>
            <span className="text-xs px-2 py-1 rounded-full border opacity-80">
              {block.title}
            </span>
            <span className={`text-xs px-2 py-1 rounded-full ${workflowBadgeClass('open')}`}>
              OPEN
            </span>
            {notifyLog && (
              <span className={`text-xs px-2 py-1 rounded-full ${notificationBadgeClass(notifyStatus)}`}>
                {notificationStatusLabel(notifyStatus)}
              </span>
            )}
          </div>

          <div className="mt-2 font-medium">{claimDisplayName(claim)}</div>

          <div className="mt-2 text-xs opacity-70 space-y-1">
            {claim.created_at && <div>When: {fmtDT(claim.created_at)}</div>}
            <div>Age: {claimAgeHelpText(ageState)}</div>
            <div>Action: {shorten(claimPrimaryId(claim), 12)}</div>
            {claim.referral_code && <div>Referral: {String(claim.referral_code)}</div>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!confirmed && (
            <button
              type="button"
              onClick={() => onConfirmClaim(claim)}
              disabled={savingThisClaim}
              className="px-3 py-2 rounded-xl border hover:opacity-80 disabled:opacity-50"
            >
              Confirm
            </button>
          )}

          <button
            type="button"
            onClick={() => onMarkContacted(claim)}
            disabled={savingThisClaim}
            className="px-3 py-2 rounded-xl border hover:opacity-80 disabled:opacity-50"
          >
            Mark contacted
          </button>

          <button
            type="button"
            onClick={() => onMarkClosed(claim)}
            disabled={savingThisClaim}
            className="px-3 py-2 rounded-xl border hover:opacity-80 disabled:opacity-50"
          >
            Close
          </button>

          {notifyLog && notifyStatus === 'failed' && (
            <button
              type="button"
              onClick={() => onRetryNotification(notifyLog.id)}
              disabled={retryingThisNotification}
              className="px-3 py-2 rounded-xl border hover:opacity-80 disabled:opacity-50"
            >
              {retryingThisNotification ? 'Retrying…' : 'Retry notification'}
            </button>
          )}

          {contact && (
            <button
              type="button"
              onClick={() => copyText(contact)}
              className="px-3 py-2 rounded-xl border hover:opacity-80"
            >
              Copy contact
            </button>
          )}

          {contact && isPhoneLike(contact) && (
            <a
              href={phoneHref(contact)}
              className="px-3 py-2 rounded-xl border hover:opacity-80"
            >
              Call
            </a>
          )}

          {contact && isPhoneLike(contact) && (
            <a
              href={smsHref(contact)}
              className="px-3 py-2 rounded-xl border hover:opacity-80"
            >
              SMS
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Section(props: {
  title: string;
  subtitle?: string;
  blocks: AvailabilityBlock[];
  claimsByBlock: Record<string, AvailabilityClaim[]>;
  notificationsByActionId: Record<string, NotificationLogRow>;
  claimSavingId: string | null;
  retryingNotificationLogId: string | null;
  editingId: string | null;
  editForm: BlockFormState | null;
  setEditForm: React.Dispatch<React.SetStateAction<BlockFormState | null>>;
  onStartEdit: (b: AvailabilityBlock) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => Promise<void>;
  onQuickStatusChange: (id: string, nextStatus: BlockStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (b: AvailabilityBlock) => Promise<void>;
  onConfirmClaim: (claim: AvailabilityClaim) => Promise<void>;
  onMarkContacted: (claim: AvailabilityClaim) => Promise<void>;
  onMarkClosed: (claim: AvailabilityClaim) => Promise<void>;
  onRetryNotification: (notificationLogId: string) => Promise<void>;
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
              claims={props.claimsByBlock[b.id] ?? []}
              notificationsByActionId={props.notificationsByActionId}
              claimSavingId={props.claimSavingId}
              retryingNotificationLogId={props.retryingNotificationLogId}
              editing={props.editingId === b.id}
              editForm={props.editingId === b.id ? props.editForm : null}
              setEditForm={props.setEditForm}
              onStartEdit={props.onStartEdit}
              onCancelEdit={props.onCancelEdit}
              onSaveEdit={props.onSaveEdit}
              onQuickStatusChange={props.onQuickStatusChange}
              onDelete={props.onDelete}
              onDuplicate={props.onDuplicate}
              onConfirmClaim={props.onConfirmClaim}
              onMarkContacted={props.onMarkContacted}
              onMarkClosed={props.onMarkClosed}
              onRetryNotification={props.onRetryNotification}
              saving={props.saving}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClaimGroup(props: {
  title: string;
  subtitle: string;
  claims: AvailabilityClaim[];
  notificationsByActionId: Record<string, NotificationLogRow>;
  claimSavingId: string | null;
  retryingNotificationLogId: string | null;
  onConfirmClaim: (claim: AvailabilityClaim) => Promise<void>;
  onMarkContacted: (claim: AvailabilityClaim) => Promise<void>;
  onMarkClosed: (claim: AvailabilityClaim) => Promise<void>;
  onRetryNotification: (notificationLogId: string) => Promise<void>;
  workflowState: ClaimWorkflowState;
}) {
  const {
    title,
    subtitle,
    claims,
    notificationsByActionId,
    claimSavingId,
    retryingNotificationLogId,
    onConfirmClaim,
    onMarkContacted,
    onMarkClosed,
    onRetryNotification,
    workflowState,
  } = props;

  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs opacity-70">{subtitle}</div>
        </div>
        <div className="text-xs px-2 py-1 rounded-full border opacity-80">
          {claims.length}
        </div>
      </div>

      {claims.length === 0 ? (
        <div className="mt-3 text-sm opacity-60">None.</div>
      ) : (
        <div className="mt-3 space-y-2">
          {claims.map((claim, index) => {
            const id = claimPrimaryId(claim);
            const rowId = String(claim.id ?? '').trim();
            const created = fmtDT(claim.created_at ?? null);
            const qty = claimQuantity(claim);
            const status = claimStatus(claim);
            const channel = String(claim.channel ?? '').trim();
            const referral = String(claim.referral_code ?? '').trim();
            const contact = String(claim.customer_contact ?? '').trim();
            const savingThisClaim = claimSavingId === rowId;
            const contacted = ownerFlag(claim, 'owner_contacted');
            const closed = ownerFlag(claim, 'owner_closed');
            const confirmed = status === 'confirmed';
            const workflow = claimWorkflowState(claim);
            const ageState = claimAgeState(claim);
            const notifyLog = rowId ? notificationsByActionId[rowId] ?? null : null;
            const notifyStatus = String(notifyLog?.status ?? '').trim().toLowerCase();
            const notifyCreatedAt = fmtDT(notifyLog?.created_at ?? null);
            const notifyMessageId = providerMessageId(notifyLog);
            const retryingThisNotification = retryingNotificationLogId === notifyLog?.id;

            return (
              <div key={`${rowId || id || index}`} className="rounded-lg border bg-black/[0.02] p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{claimDisplayName(claim)}</span>
                  <span className="text-xs px-2 py-1 rounded-full border opacity-80">{status}</span>
                  <span className="text-xs px-2 py-1 rounded-full border opacity-80">qty {qty}</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${workflowBadgeClass(workflow)}`}>
                    {workflowLabel(workflow)}
                  </span>
                  {workflowState === 'open' && (
                    <span className={`text-xs px-2 py-1 rounded-full ${claimAgeBadgeClass(ageState)}`}>
                      {claimAgeLabel(ageState)}
                    </span>
                  )}
                  {channel && (
                    <span className="text-xs px-2 py-1 rounded-full border opacity-80">{channel}</span>
                  )}
                  {confirmed && (
                    <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                      CONFIRMED
                    </span>
                  )}
                  {contacted && (
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                      CONTACTED
                    </span>
                  )}
                  {closed && (
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-700">
                      CLOSED
                    </span>
                  )}
                  {notifyLog && (
                    <span className={`text-xs px-2 py-1 rounded-full ${notificationBadgeClass(notifyStatus)}`}>
                      {notificationStatusLabel(notifyStatus)}
                    </span>
                  )}
                </div>

                <div className="mt-2 text-xs opacity-70 space-y-1">
                  {created && <div>When: {created}</div>}
                  {id && <div>Action: {shorten(id, 12)}</div>}
                  {referral && <div>Referral: {referral}</div>}
                  {workflowState === 'open' && (
                    <div className={ageState === 'stale' ? 'text-red-600' : ageState === 'aging' ? 'text-yellow-700' : ''}>
                      Age: {claimAgeHelpText(ageState)}
                    </div>
                  )}
                  {notifyLog && notifyCreatedAt && <div>Notification: {notifyCreatedAt}</div>}
                  {notifyLog && notifyMessageId && <div>Provider message id: {notifyMessageId}</div>}
                  {notifyLog && notifyStatus === 'failed' && (
                    <div className="text-red-600">Last notify attempt failed. Retry below.</div>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {!confirmed && (
                    <button
                      type="button"
                      onClick={() => onConfirmClaim(claim)}
                      disabled={savingThisClaim}
                      className="px-3 py-2 rounded-xl border hover:opacity-80 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  )}

                  {!contacted && !closed && (
                    <button
                      type="button"
                      onClick={() => onMarkContacted(claim)}
                      disabled={savingThisClaim}
                      className="px-3 py-2 rounded-xl border hover:opacity-80 disabled:opacity-50"
                    >
                      Mark contacted
                    </button>
                  )}

                  {!closed && (
                    <button
                      type="button"
                      onClick={() => onMarkClosed(claim)}
                      disabled={savingThisClaim}
                      className="px-3 py-2 rounded-xl border hover:opacity-80 disabled:opacity-50"
                    >
                      Close
                    </button>
                  )}

                  {notifyLog && notifyStatus === 'failed' && (
                    <button
                      type="button"
                      onClick={() => onRetryNotification(notifyLog.id)}
                      disabled={retryingThisNotification}
                      className="px-3 py-2 rounded-xl border hover:opacity-80 disabled:opacity-50"
                    >
                      {retryingThisNotification ? 'Retrying…' : 'Retry notification'}
                    </button>
                  )}

                  {contact && (
                    <button
                      type="button"
                      onClick={() => copyText(contact)}
                      className="px-3 py-2 rounded-xl border hover:opacity-80"
                    >
                      Copy contact
                    </button>
                  )}

                  {contact && isPhoneLike(contact) && (
                    <a
                      href={phoneHref(contact)}
                      className="px-3 py-2 rounded-xl border hover:opacity-80"
                    >
                      Call
                    </a>
                  )}

                  {contact && isPhoneLike(contact) && (
                    <a
                      href={smsHref(contact)}
                      className="px-3 py-2 rounded-xl border hover:opacity-80"
                    >
                      SMS
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BlockCard(props: {
  b: AvailabilityBlock;
  claims: AvailabilityClaim[];
  notificationsByActionId: Record<string, NotificationLogRow>;
  claimSavingId: string | null;
  retryingNotificationLogId: string | null;
  editing: boolean;
  editForm: BlockFormState | null;
  setEditForm: React.Dispatch<React.SetStateAction<BlockFormState | null>>;
  onStartEdit: (b: AvailabilityBlock) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => Promise<void>;
  onQuickStatusChange: (id: string, nextStatus: BlockStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (b: AvailabilityBlock) => Promise<void>;
  onConfirmClaim: (claim: AvailabilityClaim) => Promise<void>;
  onMarkContacted: (claim: AvailabilityClaim) => Promise<void>;
  onMarkClosed: (claim: AvailabilityClaim) => Promise<void>;
  onRetryNotification: (notificationLogId: string) => Promise<void>;
  saving: boolean;
}) {
  const {
    b,
    claims,
    notificationsByActionId,
    claimSavingId,
    retryingNotificationLogId,
    editing,
    editForm,
    setEditForm,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onQuickStatusChange,
    onDelete,
    onDuplicate,
    onConfirmClaim,
    onMarkContacted,
    onMarkClosed,
    onRetryNotification,
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

  const openClaims = sortClaimsForWorkflow(
    claims.filter((claim) => claimWorkflowState(claim) === 'open'),
    'open'
  );
  const contactedClaims = sortClaimsForWorkflow(
    claims.filter((claim) => claimWorkflowState(claim) === 'contacted'),
    'contacted'
  );
  const closedClaims = sortClaimsForWorkflow(
    claims.filter((claim) => claimWorkflowState(claim) === 'closed'),
    'closed'
  );

  const staleOpenCount = openClaims.filter((claim) => claimAgeState(claim) === 'stale').length;
  const agingOpenCount = openClaims.filter((claim) => claimAgeState(claim) === 'aging').length;

  return (
    <div className="rounded-2xl border p-4">
      {!editing ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[240px] flex-1">
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

            <div className="mt-4 rounded-xl border bg-black/[0.02] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Claim workflow</div>
                  <div className="text-xs opacity-70">
                    Open claims are prioritized by age so neglected leads rise to the top.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 rounded-full bg-orange-100 text-orange-700">
                    Open {openClaims.length}
                  </span>
                  <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                    Contacted {contactedClaims.length}
                  </span>
                  <span className="px-2 py-1 rounded-full bg-gray-200 text-gray-700">
                    Closed {closedClaims.length}
                  </span>
                  {agingOpenCount > 0 && (
                    <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                      Aging {agingOpenCount}
                    </span>
                  )}
                  {staleOpenCount > 0 && (
                    <span className="px-2 py-1 rounded-full bg-red-100 text-red-700">
                      Stale {staleOpenCount}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <ClaimGroup
                  title="Open claims"
                  subtitle="These still need owner action. Oldest risk rises first."
                  claims={openClaims}
                  notificationsByActionId={notificationsByActionId}
                  claimSavingId={claimSavingId}
                  retryingNotificationLogId={retryingNotificationLogId}
                  onConfirmClaim={onConfirmClaim}
                  onMarkContacted={onMarkContacted}
                  onMarkClosed={onMarkClosed}
                  onRetryNotification={onRetryNotification}
                  workflowState="open"
                />

                <ClaimGroup
                  title="Contacted claims"
                  subtitle="Owner has reached out, but these are not closed yet."
                  claims={contactedClaims}
                  notificationsByActionId={notificationsByActionId}
                  claimSavingId={claimSavingId}
                  retryingNotificationLogId={retryingNotificationLogId}
                  onConfirmClaim={onConfirmClaim}
                  onMarkContacted={onMarkContacted}
                  onMarkClosed={onMarkClosed}
                  onRetryNotification={onRetryNotification}
                  workflowState="contacted"
                />

                <ClaimGroup
                  title="Closed claims"
                  subtitle="Operationally complete."
                  claims={closedClaims}
                  notificationsByActionId={notificationsByActionId}
                  claimSavingId={claimSavingId}
                  retryingNotificationLogId={retryingNotificationLogId}
                  onConfirmClaim={onConfirmClaim}
                  onMarkContacted={onMarkContacted}
                  onMarkClosed={onMarkClosed}
                  onRetryNotification={onRetryNotification}
                  workflowState="closed"
                />
              </div>
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