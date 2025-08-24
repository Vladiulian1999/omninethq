'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type Stats = {
  referred_donations: number;
  referred_donations_cents: number;
};

type Donation = {
  id: number;
  amount_cents: number;
  currency: string;
  created_at: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ReferralStatsCard({ userId }: { userId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: agg }, { data: rec }] = await Promise.all([
        supabase
          .from('referral_stats')
          .select('referred_donations,referred_donations_cents')
          .eq('referrer_user_id', userId)
          .maybeSingle(),
        supabase
          .from('donations')
          .select('id,amount_cents,currency,created_at')
          .eq('referrer_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      setStats(
        agg ?? { referred_donations: 0, referred_donations_cents: 0 }
      );
      setRecent(rec ?? []);
      setLoading(false);
    })();
  }, [userId]);

  if (loading) return <div className="p-4 border rounded-2xl">Loading referrals…</div>;

  const totalGBP = ((stats?.referred_donations_cents ?? 0) / 100).toFixed(2);

  return (
    <div className="p-5 border rounded-2xl shadow-sm space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Referrals</h2>
        <span className="text-sm opacity-70">last 5 donations</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border">
          <div className="text-sm opacity-70">Referred donations</div>
          <div className="text-2xl font-bold">{stats?.referred_donations ?? 0}</div>
        </div>
        <div className="p-4 rounded-xl border">
          <div className="text-sm opacity-70">Total referred £</div>
          <div className="text-2xl font-bold">£{totalGBP}</div>
        </div>
      </div>

      <ul className="divide-y">
        {recent.map((d) => (
          <li key={d.id} className="py-2 flex items-center justify-between">
            <span className="text-sm opacity-80">
              {new Date(d.created_at).toLocaleString()}
            </span>
            <span className="font-medium">
              £{(d.amount_cents / 100).toFixed(2)}
            </span>
          </li>
        ))}
        {recent.length === 0 && (
          <li className="py-2 text-sm opacity-70">No referred donations yet.</li>
        )}
      </ul>
    </div>
  );
}
