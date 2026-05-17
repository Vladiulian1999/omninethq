import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AvailabilityActionSafe = {
  id: string;
  public_ref: string | null;
  block_id: string | null;
  tag_id: string | null;
  status: string | null;
  action_status: string | null;
  payment_status: string | null;
  quantity: number | null;
  created_at: string | null;
};

type AvailabilityBlockSafe = {
  id: string;
  tag_id: string | null;
  title: string | null;
  start_at: string | null;
  end_at: string | null;
  timezone: string | null;
  action_type: string | null;
};

type TagSafe = {
  id: string;
  title: string | null;
};

function cleanId(v: unknown) {
  return (v ?? '').toString().trim().replace(/[<>\s]/g, '');
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE(_KEY) is missing');

  return createClient(url, key, { auth: { persistSession: false } });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return 'Not available';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return date.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function fmtWindow(block: AvailabilityBlockSafe | null) {
  if (!block) return 'Availability details are unavailable for this claim.';
  if (!block.start_at && !block.end_at) return 'Always available';

  const start = fmtDateTime(block.start_at);
  const end = fmtDateTime(block.end_at);

  if (block.start_at && block.end_at) return `${start} to ${end}`;
  return block.start_at ? start : end;
}

function label(v: string | null | undefined, fallback = 'Not available') {
  const text = String(v ?? '').trim();
  return text || fallback;
}

function ClaimNotFound() {
  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Claim not found</h1>
        <p className="mt-2 text-sm text-gray-600">
          We could not find a claim for this reference.
        </p>
        <Link
          href="/explore"
          className="mt-5 inline-flex h-10 items-center rounded-xl border px-4 text-sm hover:bg-gray-50"
        >
          Back to Explore
        </Link>
      </div>
    </main>
  );
}

export default async function Page(props: {
  params: { id?: string } | Promise<{ id?: string }>;
}) {
  const params = await props.params;
  const claimRef = cleanId(params?.id);

  if (!claimRef) {
    return <ClaimNotFound />;
  }

  const supabase = getServiceSupabase();

  const { data: action, error: actionError } = await supabase
    .from('availability_actions')
    .select('id, public_ref, block_id, tag_id, status, action_status, payment_status, quantity, created_at')
    .eq('public_ref', claimRef)
    .maybeSingle<AvailabilityActionSafe>();

  if (actionError || !action) {
    return <ClaimNotFound />;
  }

  let block: AvailabilityBlockSafe | null = null;
  let relationshipValid = false;

  if (action.block_id) {
    const { data: blockData } = await supabase
      .from('availability_blocks')
      .select('id, tag_id, title, start_at, end_at, timezone, action_type')
      .eq('id', action.block_id)
      .maybeSingle<AvailabilityBlockSafe>();

    if (blockData) {
      const actionTagId = cleanId(action.tag_id);
      const blockTagId = cleanId(blockData.tag_id);
      relationshipValid = Boolean(blockData.id === action.block_id && (!actionTagId || actionTagId === blockTagId));
      if (relationshipValid) block = blockData;
    }
  }

  const resolvedTagId = cleanId(block?.tag_id) || cleanId(action.tag_id);
  let tag: TagSafe | null = null;

  if (resolvedTagId) {
    const { data: tagData } = await supabase
      .from('messages')
      .select('id, title')
      .eq('id', resolvedTagId)
      .maybeSingle<TagSafe>();

    tag = tagData ?? null;
  }

  const tagLabel = tag?.title ? `${tag.title} (${resolvedTagId})` : label(resolvedTagId);

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-sm font-medium text-green-700">Confirmation</div>
        <h1 className="mt-1 text-2xl font-semibold">Claim confirmation</h1>

        <div className="mt-6 space-y-3 text-sm text-gray-700">
          <div>
            <span className="font-medium text-gray-950">Reference:</span> {action.public_ref}
          </div>
          <div>
            <span className="font-medium text-gray-950">Status:</span> {label(action.action_status ?? action.status, 'Recorded')}
          </div>
          <div>
            <span className="font-medium text-gray-950">Action:</span> {label(block?.action_type)}
          </div>
          <div>
            <span className="font-medium text-gray-950">Tag:</span> {tagLabel}
          </div>
          <div>
            <span className="font-medium text-gray-950">Availability:</span> {label(block?.title)}
          </div>
          <div>
            <span className="font-medium text-gray-950">Time:</span> {fmtWindow(block)}
            {block?.timezone && <span> ({block.timezone})</span>}
          </div>
          <div>
            <span className="font-medium text-gray-950">Quantity:</span> {Number(action.quantity ?? 1) || 1}
          </div>
          <div>
            <span className="font-medium text-gray-950">Created:</span> {fmtDateTime(action.created_at)}
          </div>
        </div>

        {!relationshipValid && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Availability details are unavailable for this claim.
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {resolvedTagId && (
            <Link
              href={`/tag/${encodeURIComponent(resolvedTagId)}`}
              className="inline-flex h-10 items-center rounded-xl border px-4 text-sm hover:bg-gray-50"
            >
              Back to tag
            </Link>
          )}
          <Link
            href="/explore"
            className="inline-flex h-10 items-center rounded-xl border px-4 text-sm hover:bg-gray-50"
          >
            Explore
          </Link>
        </div>
      </div>
    </main>
  );
}
