'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import toast, { Toaster } from 'react-hot-toast';

type WindowKey = '7d' | '30d';

type FunnelRow = {
  tag_id: string;
  channel: string | null;
  views: number | null;
  share_clicks: number | null;
  checkout_starts: number | null;
  checkout_successes: number | null;
  view_to_success_pct: number | null;
  share_to_success_pct: number | null;
  last_event_at: string | null;
};

type TagTitleRow = {
  id: string;
  title: string | null;
  category: string | null;
};

type DisplayRow = FunnelRow & {
  title?: string | null;
  category?: string | null;
};

function fmtPct(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Number(n).toFixed(2)}%`;
}

function fmtNum(n: number | null | undefined) {
  if (n === null || n === undefined) return 0;
  return n;
}

function friendlyChannel(ch: string | null | undefined) {
  const v = (ch || 'direct').toLowerCase();
  if (v === 'system') return 'share';
  return v;
}

export default function FunnelClient() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowser(), []);

  const [windowKey, setWindowKey] = useState<WindowKey>('30d');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [has7d, setHas7d] = useState(false);
  const [query, setQuery] = useState('');

  // --- auth guard (client-side) ---
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id;
      if (!mounted) return;
      if (!uid) {
        router.replace(`/login?next=${encodeURIComponent('/admin/funnel')}`);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  // --- data loader ---
  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      // Try 7d view if selected; if it doesn't exist, fall back to 30d.
      const viewName = windowKey === '7d' ? 'tag_funnel_7d' : 'tag_funnel_30d';

      const { data: funnelData, error: funnelErr } = await supabase
        .from(viewName)
        .select('*');

      if (funnelErr) {
        // If 7d doesn't exist, fall back silently to 30d
        if (windowKey === '7d') {
          setHas7d(false);
          setWindowKey('30d');
          toast('7-day view not found. Showing 30-day funnel.');
          setLoading(false);
          return;
        }

        console.error('funnel view error:', funnelErr.message);
        if (mounted) {
          toast.error('Could not load funnel data.');
          setRows([]);
          setLoading(false);
        }
        return;
      }

      if (windowKey === '7d') setHas7d(true);

      const funnelRows = (funnelData || []) as FunnelRow[];

      // Get unique tag ids and fetch titles/categories
      const tagIds = Array.from(
        new Set(
          funnelRows
            .map((r) => (r.tag_id || '').toString().trim())
            .filter(Boolean)
        )
      );

      let titleMap = new Map<string, TagTitleRow>();

      if (tagIds.length) {
        const { data: tags, error: tagsErr } = await supabase
          .from('messages')
          .select('id, title, category')
          .in('id', tagIds);

        if (tagsErr) {
          console.warn('messages lookup error:', tagsErr.message);
        } else {
          (tags || []).forEach((t: any) => {
            titleMap.set(t.id, t as TagTitleRow);
          });
        }
      }

      const merged: DisplayRow[] = funnelRows.map((r) => {
        const t = titleMap.get(r.tag_id);
        return {
          ...r,
          title: t?.title ?? null,
          category: t?.category ?? null,
          channel: friendlyChannel(r.channel),
        };
      });

      // Sort: most checkout_successes first, then starts, then views
      merged.sort((a, b) => {
        const aS = fmtNum(a.checkout_successes);
        const bS = fmtNum(b.checkout_successes);
        if (bS !== aS) return bS - aS;

        const aCS = fmtNum(a.checkout_starts);
        const bCS = fmtNum(b.checkout_starts);
        if (bCS !== aCS) return bCS - aCS;

        return fmtNum(b.views) - fmtNum(a.views);
      });

      if (!mounted) return;
      setRows(merged);
      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, [supabase, windowKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const t = (r.title || '').toLowerCase();
      const id = (r.tag_id || '').toLowerCase();
      const ch = (r.channel || '').toLowerCase();
      const cat = (r.category || '').toLowerCase();
      return t.includes(q) || id.includes(q) || ch.includes(q) || cat.includes(q);
    });
  }, [rows, query]);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Toaster position="top-center" />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Funnel</h1>
          <p className="text-sm text-gray-600 mt-1">
            Per tag + channel: views → share clicks → checkout starts → checkout successes
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setWindowKey('30d')}
            className={`px-3 py-2 rounded-xl border text-sm ${
              windowKey === '30d' ? 'bg-black text-white' : 'hover:bg-gray-50'
            }`}
          >
            30 days
          </button>

          <button
            onClick={() => setWindowKey('7d')}
            className={`px-3 py-2 rounded-xl border text-sm ${
              windowKey === '7d' ? 'bg-black text-white' : 'hover:bg-gray-50'
            }`}
            title={has7d ? 'Show 7-day view' : 'Will fall back if view not created'}
          >
            7 days
          </button>

          <input
            className="px-3 py-2 rounded-xl border text-sm"
            placeholder="Search tag, id, channel…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <Link
            href="/explore"
            className="px-3 py-2 rounded-xl border text-sm hover:bg-gray-50"
          >
            Back to Explore
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b text-sm text-gray-600 flex items-center justify-between">
          <span>
            {loading ? 'Loading…' : `${filtered.length} rows`}
          </span>
          <span className="text-xs text-gray-400">
            Sorted by successes → starts → views
          </span>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr className="text-left">
                <th className="px-4 py-3">Tag</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Views</th>
                <th className="px-4 py-3">Share clicks</th>
                <th className="px-4 py-3">Checkout starts</th>
                <th className="px-4 py-3">Successes</th>
                <th className="px-4 py-3">View→Success</th>
                <th className="px-4 py-3">Share→Success</th>
                <th className="px-4 py-3">Open</th>
              </tr>
            </thead>

            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    No funnel data yet. Generate traffic + donations, then refresh.
                  </td>
                </tr>
              )}

              {filtered.map((r, idx) => (
                <tr key={`${r.tag_id}:${r.channel}:${idx}`} className="border-t">
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {r.title || 'Untitled tag'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {r.tag_id} {r.category ? `• ${r.category}` : ''}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-1 rounded-full border text-xs">
                      {friendlyChannel(r.channel)}
                    </span>
                  </td>

                  <td className="px-4 py-3">{fmtNum(r.views)}</td>
                  <td className="px-4 py-3">{fmtNum(r.share_clicks)}</td>
                  <td className="px-4 py-3">{fmtNum(r.checkout_starts)}</td>
                  <td className="px-4 py-3 font-semibold">{fmtNum(r.checkout_successes)}</td>

                  <td className="px-4 py-3">{fmtPct(r.view_to_success_pct)}</td>
                  <td className="px-4 py-3">{fmtPct(r.share_to_success_pct)}</td>

                  <td className="px-4 py-3">
                    <Link
                      href={`/tag/${encodeURIComponent(r.tag_id)}`}
                      className="px-3 py-2 rounded-xl border hover:bg-gray-50 inline-block"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View tag
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t text-xs text-gray-500">
          If numbers look wrong, your bottleneck is almost always: missing `checkout_success` server event (webhook),
          or client `/api/track` rejecting payload shape.
        </div>
      </div>
    </div>
  );
}
