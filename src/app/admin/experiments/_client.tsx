'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

// Optional: restrict this page by email (comma-separated allowlist in env)
// Example: NEXT_PUBLIC_ADMIN_EMAILS="you@domain.com,other@domain.com"
const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

// constants for the current experiment on /tag/[id]
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

type RawEvent = {
  id: number;
  created_at: string;
  event: string;
  tag_id: string | null;
  owner_id: string | null;
  user_id: string | null;
  anon_id: string | null;
  experiment_id: string | null;
  variant: string | null;
  referrer: string | null;
  channel: string | null;
  meta: any;
};

export default function ExperimentsClient() {
  // ✅ Hooks belong INSIDE the component:
  const supabase = useMemo(() => getSupabaseBrowser(), []);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [stats, setStats] = useState<StatRow[]>([]);
  const [ctr, setCtr] = useState<CTRRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<'variant' | 'impressions' | 'clicks' | 'ctr'>('ctr');

  // raw viewer state
  const [rawOpen, setRawOpen] = useState(false);
  const [rawVariant, setRawVariant] = useState<'A' | 'B' | null>(null);
  const [rawRows, setRawRows] = useState<RawEvent[] | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);

  // minimal admin guard (client-side)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email?.toLowerCase() || null;
      setUserEmail(email);
      setAuthChecked(true);
    })();
  }, [supabase]);

  // helper: fetch from the first available view name
  const fetchFirstAvailable = useCallback(
    async <T,>(viewNames: string[]) => {
      for (const v of viewNames) {
        const { data, error } = await supabase.from(v).select('*');
        if (!error && data) return data as T[];
      }
      return [] as T[];
    },
    [supabase]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    // CTR view: prefer 'experiment_ctr', fallback 'success_experiment_ctr'
    const ctrData = await fetchFirstAvailable<CTRRow>(['experiment_ctr', 'success_experiment_ctr']);
    setCtr(ctrData || []);

    // Tallies view: prefer 'experiment_stats', fallback 'success_experiment_stats'
    const statsData = await fetchFirstAvailable<StatRow>(['experiment_stats', 'success_experiment_stats']);
    setStats(statsData || []);
    setLoading(false);
  }, [fetchFirstAvailable]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const allowed = useMemo(() => {
    if (!authChecked) return false;
    if (ADMIN_EMAILS.length === 0) return true; // no allowlist set → allow any logged-in user
    if (!userEmail) return false;
    return ADMIN_EMAILS.includes(userEmail);
  }, [authChecked, userEmail]);

  const sortedCtr = useMemo(() => {
    const rows = [...ctr];
    switch (sortKey) {
      case 'impressions':
        return rows.sort((a, b) => b.impressions - a.impressions);
      case 'clicks':
        return rows.sort((a, b) => b.clicks - a.clicks);
      case 'variant':
        return rows.sort((a, b) => a.variant.localeCompare(b.variant));
      case 'ctr':
      default:
        return rows.sort((a, b) => (b.ctr_percent ?? 0) - (a.ctr_percent ?? 0));
    }
  }, [ctr, sortKey]);

  const groupByVariant = useMemo(() => {
    const m = new Map<string, StatRow[]>();
    for (const r of stats) {
      if (!m.has(r.variant)) m.set(r.variant, []);
      m.get(r.variant)!.push(r);
    }
    return m;
  }, [stats]);

  // open raw events modal for a specific variant
  const openRaw = useCallback(
    async (variant: 'A' | 'B') => {
      setRawOpen(true);
      setRawVariant(variant);
      setRawLoading(true);
      setRawError(null);
      setRawRows(null);
      // recent 200 events for this experiment & variant (desc)
      const { data, error } = await supabase
        .from('analytics_events')
        .select(
          'id,created_at,event,tag_id,owner_id,user_id,anon_id,experiment_id,variant,referrer,channel,meta'
        )
        .eq('experiment_id', EXPERIMENT_ID)
        .eq('variant', variant)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        setRawError(error.message || 'Failed to load events');
        setRawRows([]);
      } else {
        setRawRows((data || []) as RawEvent[]);
      }
      setRawLoading(false);
    },
    [supabase]
  );

  const closeRaw = useCallback(() => {
    setRawOpen(false);
    setRawVariant(null);
    setRawRows(null);
    setRawError(null);
  }, []);

  if (!authChecked) {
    return <div className="p-6">Loading…</div>;
  }

  if (!allowed) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <h1 className="text-2xl font-bold mb-2">Admins only</h1>
        <p className="text-gray-600">Please sign in with an authorized account.</p>
        <div className="mt-4">
          <Link href="/login" className="border rounded-xl px-4 py-2 hover:bg-gray-50">
            Go to Login
          </Link>
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

      {/* CTR Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {sortedCtr.map((row) => (
          <div key={row.variant} className="rounded-2xl border p-4 bg-white shadow-sm">
            <div className="text-sm text-gray-500">Variant</div>
            <div className="text-lg font-semibold mb-1">{row.variant}</div>
            <div className="text-sm text-gray-600">CTR</div>
            <div className="text-2xl font-bold">
              {row.ctr_percent?.toFixed?.(1) ?? Number(row.ctr_percent ?? 0).toFixed(1)}%
            </div>
            <div className="mt-3 text-xs text-gray-500">
              {row.impressions} impressions • {row.clicks} clicks
            </div>
            {/* simple bar (CTR) */}
            <div className="mt-3 h-2 w-full bg-gray-100 rounded overflow-hidden">
              <div
                className="h-2 rounded"
                style={{
                  width: `${Math.max(0, Math.min(100, Number(row.ctr_percent || 0)))}%`,
                  background: '#111',
                }}
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => openRaw(row.variant as 'A' | 'B')}
                className="text-xs border rounded-lg px-2 py-1 hover:bg-gray-50"
              >
                View raw
              </button>
            </div>
          </div>
        ))}
        {sortedCtr.length === 0 && (
          <div className="rounded-2xl border p-4 bg-white shadow-sm">
            <div className="text-sm text-gray-600">No CTR data yet.</div>
          </div>
        )}
      </div>

      {/* Sort controls */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => setSortKey('ctr')}
          className={`px-3 py-1 rounded-xl border ${
            sortKey === 'ctr' ? 'bg-black text-white' : 'hover:bg-gray-50'
          }`}
        >
          Sort by CTR
        </button>
        <button
          onClick={() => setSortKey('impressions')}
          className={`px-3 py-1 rounded-xl border ${
            sortKey === 'impressions' ? 'bg-black text-white' : 'hover:bg-gray-50'
          }`}
        >
          Sort by Impressions
        </button>
        <button
          onClick={() => setSortKey('clicks')}
          className={`px-3 py-1 rounded-xl border ${
            sortKey === 'clicks' ? 'bg-black text-white' : 'hover:bg-gray-50'
          }`}
        >
          Sort by Clicks
        </button>
        <button
          onClick={() => setSortKey('variant')}
          className={`px-3 py-1 rounded-xl border ${
            sortKey === 'variant' ? 'bg-black text-white' : 'hover:bg-gray-50'
          }`}
        >
          Sort by Name
        </button>
      </div>

      {/* Tallies table */}
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
            {Array.from(groupByVariant.entries()).map(([variant, rows]) =>
              rows
                .sort((a, b) => a.event_type.localeCompare(b.event_type))
                .map((r, i) => (
                  <tr key={`${variant}-${r.event_type}-${i}`} className="border-t">
                    <td className="p-3">{variant}</td>
                    <td className="p-3">{r.event_type}</td>
                    <td className="p-3">{r.events}</td>
                    <td className="p-3 text-gray-500">
                      {r.first_seen ? new Date(r.first_seen).toLocaleString() : '—'}
                    </td>
                    <td className="p-3 text-gray-500">
                      {r.last_seen ? new Date(r.last_seen).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))
            )}
            {stats.length === 0 && (
              <tr>
                <td className="p-6 text-center text-gray-500" colSpan={5}>
                  No events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-xs text-gray-500">
        Tip: Events are logged by <code>/api/track</code>. Variants stick per device via{' '}
        <code>localStorage</code>.
      </div>

      {/* Raw modal */}
      {rawOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-[min(900px,92vw)] max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">
                Raw events — {EXPERIMENT_ID} / Variant {rawVariant}
              </div>
              <button
                onClick={closeRaw}
                className="text-sm border rounded-lg px-3 py-1 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
            <div className="p-4 overflow-auto text-xs">
              {rawLoading && <div>Loading…</div>}
              {rawError && <div className="text-red-600">{rawError}</div>}
              {!rawLoading && !rawError && (!rawRows || rawRows.length === 0) && (
                <div>No rows.</div>
              )}
              {!rawLoading && !rawError && rawRows && (
                <pre className="whitespace-pre-wrap break-words">
                  {JSON.stringify(rawRows, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
