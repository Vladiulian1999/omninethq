'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import Link from 'next/link';

type Row = {
  tag_id: string;
  shares: number;
  opens: number;
  actions: number;
  conversion_rate: number | null;
  first_event_at: string | null;
  last_event_at: string | null;
};

export default function FunnelClient() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('tag_funnel_30d')
          .select('*')
          .order('conversion_rate', { ascending: false })
          .limit(200);
        if (error) throw error;
        setRows((data as Row[]) || []);
      } catch (e: any) {
        setErr(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  const filtered = rows.filter(r => r.tag_id.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by tag ID…"
          className="border rounded px-3 py-2 text-sm w-64"
        />
        <span className="text-xs text-gray-500">
          {filtered.length} / {rows.length} rows
        </span>
      </div>

      {loading && <div>Loading…</div>}
      {err && <div className="text-red-600 text-sm">{err}</div>}

      {!loading && !err && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Tag</th>
                <th className="py-2 pr-4">Shares</th>
                <th className="py-2 pr-4">Opens</th>
                <th className="py-2 pr-4">Actions</th>
                <th className="py-2 pr-4">Conv %</th>
                <th className="py-2 pr-4">Last</th>
                <th className="py-2 pr-4">Open</th>
                <th className="py-2 pr-4">Print</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const last = r.last_event_at ? new Date(r.last_event_at).toLocaleString() : '–';
                const tagLink = `/tag/${encodeURIComponent(r.tag_id)}`;
                const printLink = `/tag/${encodeURIComponent(r.tag_id)}/print`;
                return (
                  <tr key={r.tag_id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-4 font-mono">{r.tag_id}</td>
                    <td className="py-2 pr-4">{r.shares ?? 0}</td>
                    <td className="py-2 pr-4">{r.opens ?? 0}</td>
                    <td className="py-2 pr-4">{r.actions ?? 0}</td>
                    <td className="py-2 pr-4">
                      {typeof r.conversion_rate === 'number' ? r.conversion_rate.toFixed(2) : '0.00'}
                    </td>
                    <td className="py-2 pr-4 text-gray-500">{last}</td>
                    <td className="py-2 pr-4">
                      <Link
                        href={tagLink}
                        className="inline-block px-2 py-1 border rounded hover:bg-gray-100"
                        target="_blank"
                      >
                        View
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <Link
                        href={printLink}
                        className="inline-block px-2 py-1 border rounded hover:bg-gray-100"
                        target="_blank"
                      >
                        Print
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    No results.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
