'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

const supabase = getSupabaseBrowser();

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const EXPERIMENT_ID = 'cta_main_v1';

type StatRow = {
  variant: string;
  event_type: string;
  events: number;
  first_seen: string | null;
  last_seen: string | null;
};

type CTRRow = {
  variant: string;
  impressions: number;
  clicks: number;
  ctr_percent: number;
};

type CTRByTagRow = {
  tag_id: string | null;
  variant: string;
  impressions: number;
  clicks: number;
  ctr_percent: number;
};

export default function ExperimentsClient() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [dateRange, setDateRange] = useState<'all' | '30d' | '7d'>('all');
  const [tagFilter, setTagFilter] = useState<string>(''); // optional tag id

  const [stats, setStats] = useState<StatRow[]>([]);
  const [ctr, setCtr] = useState<CTRRow[]>([]);
  const [byTag, setByTag] = useState<CTRByTagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<'variant' | 'impressions' | 'clicks' | 'ctr'>('ctr');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email?.toLowerCase() || null;
      setUserEmail(email);
      setAuthChecked(true);
    })();
  }, []);

  const allowed = useMemo(() => {
    if (!authChecked) return false;
    if (ADMIN_EMAILS.length === 0) return true;
    if (!userEmail) return false;
    return ADMIN_EMAILS.includes(userEmail);
  }, [authChecked, userEmail]);

  const pickViews = useCallback(() => {
    switch (dateRange) {
      case '30d':
        return {
          ctr: ['experiment_ctr_30d', 'experiment_ctr'],
          stats: ['experiment_stats_30d', 'experiment_stats'],
          byTag: ['experiment_ctr_by_tag_30d', 'experiment_ctr_by_tag'],
        };
      case '7d':
        return {
          ctr: ['experiment_ctr_7d', 'experiment_ctr'],
          stats: ['experiment_stats_7d', 'experiment_stats'],
          byTag: ['experiment_ctr_by_tag_7d', 'experiment_ctr_by_tag'],
        };
      case 'all':
      default:
        return {
          ctr: ['experiment_ctr'],
          stats: ['experiment_stats'],
          byTag: ['experiment_ctr_by_tag'],
        };
    }
  }, [dateRange]);

  const fetchFirstAvailable = useCallback(async <T,>(viewNames: string[]) => {
    for (const v of viewNames) {
      const { data, error } = await supabase.from(v).select('*');
      if (!error && data) return data as T[];
    }
    return [] as T[];
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const views = pickViews();

    const [ctrData, statsData, byTagData] = await Promise.all([
      fetchFirstAvailable<CTRRow>(views.ctr),
      fetchFirstAvailable<StatRow>(views.stats),
      fetchFirstAvailable<CTRByTagRow>(views.byTag),
    ]);

    setCtr(ctrData || []);
    setStats(statsData || []);
    setByTag(byTagData || []);
    setLoading(false);
  }, [pickViews, fetchFirstAvailable]);

  useEffect(() => {
    loadData();
  }, [loadData, dateRange]);

  const sortedCtr = useMemo(() => {
    const rows = [...ctr];
    switch (sortKey) {
      case 'impressions': return rows.sort((a, b) => b.impressions - a.impressions);
      case 'clicks':      return rows.sort((a, b) => b.clicks - a.clicks);
      case 'variant':     return rows.sort((a, b) => a.variant.localeCompare(b.variant));
      case 'ctr':
      default:            return rows.sort((a, b) => (b.ctr_percent ?? 0) - (a.ctr_percent ?? 0));
    }
  }, [ctr, sortKey]);

  const tableStats = useMemo(() => {
    // If tagFilter is set, filter the tallies to impressions/clicks for that tag via byTag
    if (!tagFilter) return stats;
    const tagRows = byTag.filter(r => r.tag_id === tagFilter);
    // Convert byTag rows into pseudo tallies (only for impressions/clicks)
    const tallies: StatRow[] = [];
    for (const r of tagRows) {
      tallies.push({ variant: r.variant, event_type: 'cta_impression', events: r.impressions, first_seen: null, last_seen: null });
      tallies.push({ variant: r.variant, event_type: 'cta_click', events: r.clicks, first_seen: null, last_seen: null });
    }
    return tallies;
  }, [stats, byTag, tagFilter]);

  if (!authChecked) return <div className="p-6">Loading…</div>;
  if (!allowed) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <h1 className="text-2xl font-bold mb-2">Admins only</h1>
        <p className="text-gray-600">Please sign in with an authorized account.</p>
        <div className="mt-4">
          <Link href="/login" className="border rounded-xl px-4 py-2 hover:bg-gray-50">Go to Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Experiments — Success Page A/B</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="text-sm rounded-xl border px-3 py-1 hover:bg-gray-50"
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <div className="text-sm text-gray-500">/success CTA performance</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <div className="flex gap-2">
          {(['ctr','impressions','clicks','variant'] as const).map(k => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              className={`px-3 py-1 rounded-xl border ${sortKey === k ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
            >
              Sort by {k === 'ctr' ? 'CTR' : k.charAt(0).toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-2 items-center">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="px-3 py-1 rounded-xl border text-sm"
          >
            <option value="all">All time</option>
            <option value="30d">Last 30 days</option>
            <option value="7d">Last 7 days</option>
          </select>
          <input
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value.trim())}
            placeholder="Filter by tag_id (optional)"
            className="px-3 py-1 rounded-xl border text-sm w-[240px]"
          />
        </div>
      </div>

      {/* CTR Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {sortedCtr.map((row) => (
          <div key={row.variant} className="rounded-2xl border p-4 bg-white shadow-sm">
            <div className="text-sm text-gray-500">Variant</div>
            <div className="text-lg font-semibold mb-1">{row.variant}</div>
            <div className="text-sm text-gray-600">CTR</div>
            <div className="text-2xl font-bold">{Number(row.ctr_percent ?? 0).toFixed(1)}%</div>
            <div className="mt-3 text-xs text-gray-500">
              {row.impressions} impressions • {row.clicks} clicks
            </div>
            <div className="mt-3 h-2 w-full bg-gray-100 rounded overflow-hidden">
              <div
                className="h-2 rounded"
                style={{ width: `${Math.max(0, Math.min(100, Number(row.ctr_percent || 0)))}%`, background: '#111' }}
              />
            </div>
          </div>
        ))}
        {sortedCtr.length === 0 && (
          <div className="rounded-2xl border p-4 bg-white shadow-sm">
            <div className="text-sm text-gray-600">No CTR data yet.</div>
          </div>
        )}
      </div>

      {/* Tallies table (variant-level or per-tag if filtered) */}
      <div className="overflow-x-auto border rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3">Variant</th>
              <th className="p-3">Event</th>
              <th className="p-3">Count</th>
              <th className="p-3">First seen</th>
              <th className="p-3">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {tableStats.length > 0 ? (
              tableStats
                .sort((a, b) => a.event_type.localeCompare(b.event_type))
                .map((r, i) => (
                  <tr key={`${r.variant}-${r.event_type}-${i}`} className="border-t">
                    <td className="p-3">{r.variant}</td>
                    <td className="p-3">{r.event_type}</td>
                    <td className="p-3">{r.events}</td>
                    <td className="p-3 text-gray-500">{r.first_seen ? new Date(r.first_seen).toLocaleString() : '—'}</td>
                    <td className="p-3 text-gray-500">{r.last_seen ? new Date(r.last_seen).toLocaleString() : '—'}</td>
                  </tr>
                ))
            ) : (
              <tr>
                <td className="p-6 text-center text-gray-500" colSpan={5}>No events yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-xs text-gray-500">
        Tip: CTR uses unique clicks per anon+tag per day. Change the window with the selector.
      </div>
    </div>
  );
}

