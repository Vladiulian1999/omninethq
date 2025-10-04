'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Row = {
  id: string
  ts: string
  event_type: string | null
  status: string | null
  subject: string | null
  to_email: string | null
  owner_id: string | null
  tag_id: string | null // text (e.g., tag-7g5nq)
  booking_id: string | null // uuid
}

const PAGE_SIZE = 25

const EVENT_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'email.sent', value: 'email.sent' },
  { label: 'email.delivered', value: 'email.delivered' },
  { label: 'email.bounced', value: 'email.bounced' },
  { label: 'email.complained', value: 'email.complained' },
  { label: 'email.opened', value: 'email.opened' },
  { label: 'email.clicked', value: 'email.clicked' },
  { label: 'email.failed', value: 'email.failed' },
]

const SINCE_OPTIONS = [
  { label: '24 hours', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
]

function fmtWhen(iso: string) {
  try {
    const d = new Date(iso)
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  } catch {
    return iso
  }
}

export default function AdminEmailPage() {
  const [me, setMe] = useState<{ id: string; email: string } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [toFilter, setToFilter] = useState('')
  const [eventType, setEventType] = useState<string>('all')
  const [sinceDays, setSinceDays] = useState<number>(7)
  const [showAll, setShowAll] = useState(false) // only visible if admin

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const sinceISO = useMemo(() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - sinceDays)
    return d.toISOString()
  }, [sinceDays])

  useEffect(() => {
    ;(async () => {
      // who am I
      const { data: userData } = await supabase.auth.getUser()
      const id = userData?.user?.id || ''
      const email = userData?.user?.email || ''
      setMe(id ? { id, email } : null)

      // admin?
      if (id) {
        const { data: adminRow } = await supabase
          .from('admin_user_ids')
          .select('user_id')
          .eq('user_id', id)
          .maybeSingle()
        setIsAdmin(!!adminRow)
      }
    })()
  }, [])

  async function fetchRows(goToPage = page) {
    if (!me) return
    setLoading(true)
    setError(null)
    try {
      let q = supabase
        .from('email_events')
        .select('id, ts, event_type, status, subject, to_email, owner_id, tag_id, booking_id', { count: 'exact' })
        .gte('ts', sinceISO)
        .order('ts', { ascending: false })

      if (eventType !== 'all') q = q.eq('event_type', eventType)
      if (toFilter.trim()) q = q.ilike('to_email', `%${toFilter.trim()}%`)

      // Optional client-side scoping (RLS still enforces server-side)
      if (!(isAdmin && showAll)) {
        q = q.or(`to_email.eq.${me.email},owner_id.eq.${me.id}`)
      }

      const from = (goToPage - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data, error, count } = await q.range(from, to)

      if (error) throw error
      setRows((data as Row[]) || [])
      setTotal(count || 0)
      setPage(goToPage)
    } catch (e: any) {
      setError(e?.message || 'Failed to load events')
    } finally {
      setLoading(false)
    }
  }

  // initial + whenever filters change
  useEffect(() => {
    if (!me) return
    fetchRows(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, eventType, sinceISO, toFilter, showAll])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Email Events</h1>
        <div className="text-sm text-gray-500">
          {isAdmin ? 'Admin mode' : 'Scoped to your emails & tags'}
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <input
          className="w-full rounded-xl border px-3 py-2 text-sm"
          placeholder='Search "to"'
          value={toFilter}
          onChange={(e) => setToFilter(e.target.value)}
        />

        <select
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
        >
          {EVENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={sinceDays}
          onChange={(e) => setSinceDays(parseInt(e.target.value, 10))}
        >
          {SINCE_OPTIONS.map((o) => (
            <option key={o.days} value={o.days}>{o.label}</option>
          ))}
        </select>

        <div className="flex items-center justify-between gap-3">
          {isAdmin && (
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
              />
              Show all (admin)
            </label>
          )}
          <button
            onClick={() => fetchRows(1)}
            className="ml-auto rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="grid grid-cols-12 border-b bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600">
          <div className="col-span-2">When</div>
          <div className="col-span-2">Event</div>
          <div className="col-span-2">To</div>
          <div className="col-span-3">Subject</div>
          <div className="col-span-2">Owner / Tag / Booking</div>
          <div className="col-span-1 text-right">Status</div>
        </div>

        {error && (
          <div className="px-4 py-6 text-sm text-red-600">{error}</div>
        )}

        {!error && rows.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-gray-500">
            No events yet.
          </div>
        )}

        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-12 border-b px-4 py-3 text-sm">
            <div className="col-span-2">{fmtWhen(r.ts)}</div>
            <div className="col-span-2">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                {r.event_type ?? '—'}
              </span>
            </div>
            <div className="col-span-2 break-words">{r.to_email ?? '—'}</div>
            <div className="col-span-3 break-words">{r.subject ?? '—'}</div>
            <div className="col-span-2 break-words">
              <div className="text-xs text-gray-700">
                {r.owner_id ? <div>owner: <span className="font-mono">{r.owner_id.slice(0, 8)}…</span></div> : null}
                {r.tag_id ? (
                  <div>
                    tag:{' '}
                    <Link
                      className="text-blue-600 underline"
                      href={`/tag/${encodeURIComponent(r.tag_id)}`}
                      target="_blank"
                    >
                      {r.tag_id}
                    </Link>
                  </div>
                ) : null}
                {r.booking_id ? (
                  <div className="font-mono">booking: {r.booking_id.slice(0, 8)}…</div>
                ) : null}
                {!r.owner_id && !r.tag_id && !r.booking_id ? '—' : null}
              </div>
            </div>
            <div className="col-span-1 text-right">
              <span className="text-xs text-gray-600">{r.status ?? '—'}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Pager */}
      <div className="mt-4 flex items-center justify-between text-sm">
        <div>Page {page} of {totalPages} &middot; {total} events</div>
        <div className="flex gap-2">
          <button
            className="rounded-xl border px-3 py-1 disabled:opacity-50"
            onClick={() => fetchRows(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
          >
            Previous
          </button>
          <button
            className="rounded-xl border px-3 py-1 disabled:opacity-50"
            onClick={() => fetchRows(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || loading}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
