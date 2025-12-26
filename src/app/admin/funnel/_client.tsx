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

type RevenueRow30d = {
  tag_id: string;
  channel: string | null;
  copy_variant: string | null;
  checkout_successes: number | null;
  revenue_cents: number | null;
  last_success_at: string | null;
};

type BestRevenueChannelRow = {
  tag_id: string;
  channel: string | null;
  checkout_successes: number | null;
  revenue_cents: number | null;
  last_success_at: string | null;
};

type TagTitleRow = {
  id: string;
  title: string | null;
  category: string | null;
};

type DisplayRow = FunnelRow & {
  title?: string | null;
  category?: string | null;

  // revenue (30d)
  revenue_cents_30d?: number | null;

  // winner by revenue (30d)
  winner_channel?: string | null;
  winner_successes?: number | null;
  winner_revenue_cents?: number | null;
  winner_last_success_at?: string | null;
};

function fmtPct(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Number(n).toFixed(2)}%`;
}

function fmtNum(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return 0;
  return Number(n);
}

function fmtGBPFromCents(cents: number | null | undefined) {
  const v = fmtNum(cents);
  return `£${(v / 100).toFixed(2)}`;
}

function friendlyChannel(ch: string | null | undefined) {
  const v = (ch || 'direct').toLowerCase();
  if (v === 'system') return 'share';
  return v;
}

function winnerBadge(ch?: string | null) {
  const c = (ch || '').toLowerCase();
  if (!c) return null;

  const base = 'inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs';
  const label = c === 'system' ? 'share' : c;

  return <span className={base}>🏆 {label}</span>;
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

      // Existing funnel views (events-based)
      const viewName = windowKey === '7d' ? 'tag_funnel_7d' : 'tag_funnel_30d';
      const { data: funnelData, error: funnelErr } = await supabase.from(viewName).select('*');

      if (funnelErr) {
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

      // --- Revenue (30d) by tag+channel ---
      // NOTE: revenue view is 30d only (by design). It still adds value even if you choose 7d events.
      const { data: revenueData, error: revErr } = await supabase
        .from('tag_revenue_funnel_30d')
        .select('*');

      if (revErr) {
        console.warn('revenue view error:', revErr.message);
      }

      // Map revenue by tag_id + channel
      const revenueMap = new Map<string, number>();
      (revenueData as any[] | null)?.forEach((r) => {
        const tag_id = (r?.tag_id || '').toString();
        const channel = friendlyChannel(r?.channel);
        const key = `${tag_id}::${channel}`;
        const rev = Number(r?.revenue_cents ?? 0) || 0;
        // If multiple rows exist (e.g. copy_variant splits), sum them
        revenueMap.set(key, (revenueMap.get(key) || 0) + rev);
      });

      // Winner by revenue (30d)
      const { data: winnersData, error: winErr } = await supabase
        .from('tag_best_revenue_channel_30d')
        .select('*');

      if (winErr) {
        console.warn('winner revenue view error:', winErr.message);
      }

      const winnerMap = new Map<string, BestRevenueChannelRow>();
      (winnersData as any[] | null)?.forEach((w) => {
        if (w?.tag_id) winnerMap.set(w.tag_id, w as BestRevenueChannelRow);
      });

      // Tag titles/categories
      const tagIds = Array.from(
        new Set(funnelRows.map((r) => (r.tag_id || '').toString().trim()).filter(Boolean))
      );

      const titleMap = new Map<string, TagTitleRow>();
      if (tagIds.length) {
        const { data: tags, error: tagsErr } = await supabase
          .from('messages')
          .select('id, title, category')
          .in('id', tagIds);

        if (tagsErr) {
          console.warn('messages lookup error:', tagsErr.message);
        } else {
          (tags || []).forEach((t: any) => titleMap.set(t.id, t as TagTitleRow));
        }
      }

      const merged: DisplayRow[] = funnelRows.map((r) => {
        const t = titleMap.get(r.tag_id);
        const w = winnerMap.get(r.tag_id);

        const rowChannel = friendlyChannel(r.channel);
        const revKey = `${r.tag_id}::${rowChannel}`;
        const revenue_cents_30d = revenueMap.get(revKey) ?? 0;

        return {
          ...r,
          title: t?.title ?? null,
          category: t?.category ?? null,
          channel: rowChannel,

          revenue_cents_30d,

          winner_channel: w?.channel ? friendlyChannel(w.channel) : null,
          winner_successes: w?.checkout_successes ?? null,
          winner_revenue_cents: w?.revenue_cents ?? null,
          winner_last_success_at: w?.last_success_at ?? null,
        };
      });

      // Sort: tags with winner revenue first, then by revenue (row), then successes, then starts, then views
      merged.sort((a, b) => {
        const aWinRev = fmtNum(a.winner_revenue_cents);
        const bWinRev = fmtNum(b.winner_revenue_cents);
        const aHasW = aWinRev > 0 ? 1 : 0;
        const bHasW = bWinRev > 0 ? 1 : 0;
        if (bHasW !== aHasW) return bHasW - aHasW;

        const aRev = fmtNum(a.revenue_cents_30d);
        const bRev = fmtNum(b.revenue_cents_30d);
        if (bRev !== aRev) return bRev - aRev;

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
      const win = (r.winner_channel || '').toLowerCase();
      return t.includes(q) || id.includes(q) || ch.includes(q) || cat.includes(q) || win.includes(q);
    });
  }, [rows, query]);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Toaster position="top-center" />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Funnel</h1>
          <p className="text-sm text-gray-600 mt-1">
            Per tag + channel: views → share clicks → checkout starts → successes (+ 30d revenue)
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

          <Link href="/explore" className="px-3 py-2 rounded-xl border text-sm hover:bg-gray-50">
            Back to Explore
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b text-sm text-gray-600 flex items-center justify-between">
          <span>{loading ? 'Loading…' : `${filtered.length} rows`}</span>
          <span className="text-xs text-gray-400">Sorted by winner revenue → revenue → successes → starts → views</span>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[1260px] w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr className="text-left">
                <th className="px-4 py-3">Tag</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Winner</th>
                <th className="px-4 py-3">Views</th>
                <th className="px-4 py-3">Share clicks</th>
                <th className="px-4 py-3">Checkout starts</th>
                <th className="px-4 py-3">Successes</th>
                <th className="px-4 py-3">Revenue (30d)</th>
                <th className="px-4 py-3">View→Success</th>
                <th className="px-4 py-3">Share→Success</th>
                <th className="px-4 py-3">Open</th>
              </tr>
            </thead>

            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                    No funnel data yet. Generate traffic + donations, then refresh.
                  </td>
                </tr>
              )}

              {filtered.map((r, idx) => (
                <tr key={`${r.tag_id}:${r.channel}:${idx}`} className="border-t">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.title || 'Untitled tag'}</div>
                    <div className="text-xs text-gray-500">
                      {r.tag_id} {r.category ? `• ${r.category}` : ''}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-1 rounded-full border text-xs">
                      {friendlyChannel(r.channel)}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    {r.winner_channel ? (
                      <div className="flex flex-col gap-1">
                        {winnerBadge(r.winner_channel)}
                        <div className="text-xs text-gray-500">
                          {fmtGBPFromCents(r.winner_revenue_cents)} • {fmtNum(r.winner_successes)} success
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3">{fmtNum(r.views)}</td>
                  <td className="px-4 py-3">{fmtNum(r.share_clicks)}</td>
                  <td className="px-4 py-3">{fmtNum(r.checkout_starts)}</td>
                  <td className="px-4 py-3 font-semibold">{fmtNum(r.checkout_successes)}</td>
                  <td className="px-4 py-3 font-semibold">{fmtGBPFromCents(r.revenue_cents_30d)}</td>
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
          Winner is computed from <span className="font-mono">tag_best_revenue_channel_30d</span>. Revenue comes from{' '}
          <span className="font-mono">donations</span> (30d).
        </div>
      </div>
    </div>
  );
}
