"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type EmailEvent = {
  id: string;
  provider: string;
  message_id: string | null;
  event_type: string;
  to_email: string | null;
  from_email: string | null;
  subject: string | null;
  reason: string | null;
  status: string | null;
  tag_id: string | null;
  owner_id: string | null;
  booking_id: string | null;
  ts: string; // ISO
  created_at: string;
};

const PAGE_SIZE = 50;

export default function ClientEmailEvents() {
  const [rows, setRows] = useState<EmailEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>(""); // event_type filter
  const [sinceDays, setSinceDays] = useState<number>(7);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState<number | null>(null);

  const sinceISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - sinceDays);
    return d.toISOString();
  }, [sinceDays]);

  async function fetchPage(p = 0) {
    setLoading(true);
    let query = supabase
      .from("email_events")
      .select("*", { count: "exact" })
      .gte("ts", sinceISO)
      .order("ts", { ascending: false });

    if (q) query = query.ilike("to_email", `%${q}%`);
    if (type) query = query.eq("event_type", type);

    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await query.range(from, to);

    if (error) {
      console.error("fetch email_events error", error);
      setRows([]);
      setTotal(0);
    } else {
      setRows((data as EmailEvent[]) ?? []);
      setTotal(count ?? null);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, type, sinceISO]);

  function Badge({ v }: { v: string }) {
    const map: Record<string, string> = {
      delivered: "bg-green-100 text-green-800",
      opened: "bg-blue-100 text-blue-800",
      clicked: "bg-indigo-100 text-indigo-800",
      bounced: "bg-red-100 text-red-800",
      complained: "bg-red-100 text-red-800",
      failed: "bg-red-100 text-red-800",
      sent: "bg-gray-100 text-gray-800",
      deferred: "bg-yellow-100 text-yellow-800",
      queued: "bg-gray-100 text-gray-800",
      dropped: "bg-gray-100 text-gray-800",
    };
    const cls = map[v] || "bg-gray-100 text-gray-800";
    return <span className={`px-2 py-0.5 rounded-full text-xs ${cls}`}>{v}</span>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col">
          <label className="text-xs text-gray-600 mb-1">Search “to”</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="user@example.com"
            className="border rounded-lg px-3 py-2 w-64"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600 mb-1">Event</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="border rounded-lg px-3 py-2"
          >
            <option value="">All</option>
            {[
              "sent","delivered","opened","clicked","bounced",
              "complained","failed","deferred","queued","dropped",
            ].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600 mb-1">Since</label>
          <select
            value={sinceDays}
            onChange={(e) => setSinceDays(parseInt(e.target.value))}
            className="border rounded-lg px-3 py-2"
          >
            {[1,3,7,14,30,90].map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => fetchPage(page)}
          className="ml-auto border rounded-lg px-3 py-2"
        >
          Refresh
        </button>
      </div>

      <div className="text-sm text-gray-600">
        {loading ? "Loading…" : `${total ?? rows.length} events`}
      </div>

      <div className="overflow-x-auto border rounded-xl">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="p-3">When</th>
              <th className="p-3">Event</th>
              <th className="p-3">To</th>
              <th className="p-3">Subject</th>
              <th className="p-3">Owner / Tag / Booking</th>
              <th className="p-3">Reason/Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3 whitespace-nowrap">
                  {new Date(r.ts).toLocaleString()}
                </td>
                <td className="p-3"><Badge v={r.event_type} /></td>
                <td className="p-3">
                  <div className="font-medium">{r.to_email ?? "-"}</div>
                  <div className="text-xs text-gray-500">
                    from {r.from_email ?? "-"}
                  </div>
                </td>
                <td className="p-3">
                  <div className="truncate max-w-[28ch]">{r.subject ?? "-"}</div>
                  <div className="text-xs text-gray-500 truncate max-w-[28ch]">
                    msg: {r.message_id ?? "-"}
                  </div>
                </td>
                <td className="p-3 text-xs text-gray-700">
                  <div>owner: {r.owner_id ?? "-"}</div>
                  <div>tag: {r.tag_id ?? "-"}</div>
                  <div>booking: {r.booking_id ?? "-"}</div>
                </td>
                <td className="p-3 text-xs text-gray-700">
                  <div>{r.reason ?? "-"}</div>
                  <div className="text-gray-500">{r.status ?? "-"}</div>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td className="p-6 text-center text-gray-500" colSpan={6}>No events yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          className="border rounded-lg px-3 py-2 disabled:opacity-50"
          disabled={page === 0 || loading}
          onClick={() => { const p = Math.max(0, page - 1); setPage(p); fetchPage(p); }}
        >
          Previous
        </button>
        <div className="text-sm text-gray-600">Page {page + 1}</div>
        <button
          className="border rounded-lg px-3 py-2 disabled:opacity-50"
          disabled={loading || (total !== null && (page + 1) * PAGE_SIZE >= (total || 0))}
          onClick={() => { const p = page + 1; setPage(p); fetchPage(p); }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
