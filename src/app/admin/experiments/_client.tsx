'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Optional: restrict this page by email (comma-separated allowlist in env)
// Example: NEXT_PUBLIC_ADMIN_EMAILS="you@domain.com,other@domain.com"
const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

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

export default function ExperimentsClient() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [stats, setStats] = useState<StatRow[]>([]);
  const [ctr, setCtr] = useState<CTRRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<'variant' | 'impressions' | 'clicks' | 'ctr'>('ctr');

  // minimal admin guard (client-side)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email?.toLowerCase() || null;
      setUserEmail(email);
      setAuthChecked(true);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // fetch CTR
      const { data: d1 } = await supabase
        .from('success_experiment_ctr')
        .select('*');
      setCtr((d1 || []) as CTRRow[]);

      // fetch tallies
      const { data: d2 } = await supabase
        .from('success_experiment_stats')
        .select('*');
      setStats((d2 || []) as StatRow[]);
      setLoading(false);
    })();
  }, []);

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
        return rows.sort((a, b) => b.ctr_percent - a.ctr_percent);
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

  if (!authChecked) {
    return <div className="p-6">Loading…</div>;
  }

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
        <div className="text-sm text-gray-500">/success CTA performance</div>
      </div>

      {/* CTR Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {sortedCtr.map((row) => (
          <div key={row.variant} className="rounded-2xl border p-4 bg-white shadow-sm">
            <div className="text-sm text-gray-500">Variant</div>
            <div className="text-lg font-semibold mb-1">{row.variant}</div>
            <div className="text-sm text-gray-600">CTR</div>
            <div className="text-2xl font-bold">{row.ctr_percent?.toFixed(1)}%</div>
            <div className="mt-3 text-xs text-gray-500">
              {row.impressions} impressions • {row.clicks} clicks
            </div>
            {/* simple bar (CTR) */}
            <div className="mt-3 h-2 w-full bg-gray-100 rounded">
              <div
                className="h-2 rounded"
                style={{ width: `${Math.max(0, Math.min(100, row.ctr_percent || 0))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Sort controls */}
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setSortKey('ctr')}
          className={`px-3 py-1 rounded-xl border ${sortKey === 'ctr' ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
        >
          Sort by CTR
        </button>
        <button
          onClick={() => setSortKey('impressions')}
          className={`px-3 py-1 rounded-xl border ${sortKey === 'impressions' ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
        >
          Sort by Impressions
        </button>
        <button
          onClick={() => setSortKey('clicks')}
          className={`px-3 py-1 rounded-xl border ${sortKey === 'clicks' ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
        >
          Sort by Clicks
        </button>
        <button
          onClick={() => setSortKey('variant')}
          className={`px-3 py-1 rounded-xl border ${sortKey === 'variant' ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
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
                    <td className="p-3 text-gray-500">{r.first_seen ? new Date(r.first_seen).toLocaleString() : '—'}</td>
                    <td className="p-3 text-gray-500">{r.last_seen ? new Date(r.last_seen).toLocaleString() : '—'}</td>
                  </tr>
                ))
            )}
            {stats.length === 0 && (
              <tr>
                <td className="p-6 text-center text-gray-500" colSpan={5}>No events yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-xs text-gray-500">
        Tip: Events are logged by <code>/api/track</code>. Variants stick per device via <code>localStorage</code>.
      </div>
    </div>
  );
}
