'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Row = {
  user_id: string;
  display_name: string;
  total_clicks: number;
  referred_donations_count: number;
  referred_donations_amount_cents: number;
};

type SortKey = 'clicks' | 'donations' | 'amount';

export default function LeaderboardClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [sort, setSort] = useState<SortKey>('clicks');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('referral_leaderboard')
        .select('user_id, display_name, total_clicks, referred_donations_count, referred_donations_amount_cents');
      if (error) {
        console.error(error);
        setRows([]);
      } else {
        setRows(data || []);
      }
      setLoading(false);
    })();
  }, []);

  const sorted = useMemo(() => {
    const clone = [...rows];
    switch (sort) {
      case 'donations':
        return clone.sort((a, b) => b.referred_donations_count - a.referred_donations_count);
      case 'amount':
        return clone.sort((a, b) => b.referred_donations_amount_cents - a.referred_donations_amount_cents);
      case 'clicks':
      default:
        return clone.sort((a, b) => b.total_clicks - a.total_clicks);
    }
  }, [rows, sort]);

  const fmtGBP = (cents: number) => `£${(cents / 100).toFixed(2)}`;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Referral Leaderboard</h1>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setSort('clicks')}
          className={`px-3 py-1 rounded-xl border ${sort === 'clicks' ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
        >
          Sort by Visits
        </button>
        <button
          onClick={() => setSort('donations')}
          className={`px-3 py-1 rounded-xl border ${sort === 'donations' ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
        >
          Sort by Donations
        </button>
        <button
          onClick={() => setSort('amount')}
          className={`px-3 py-1 rounded-xl border ${sort === 'amount' ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
        >
          Sort by Amount
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="overflow-x-auto border rounded-2xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">User</th>
                <th className="p-3">Visits</th>
                <th className="p-3">Referred donations</th>
                <th className="p-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.user_id} className="border-t">
                  <td className="p-3">{i + 1}</td>
                  <td className="p-3">
                    <a className="hover:underline" href={`/u/${r.user_id}`}>{r.display_name || 'User'}</a>
                  </td>
                  <td className="p-3">{r.total_clicks}</td>
                  <td className="p-3">{r.referred_donations_count}</td>
                  <td className="p-3">{fmtGBP(r.referred_donations_amount_cents)}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500">No data yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
