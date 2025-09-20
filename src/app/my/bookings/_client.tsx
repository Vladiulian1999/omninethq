'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

type Booking = {
  id: string
  tag_id: string
  requester_name: string
  requester_email: string
  requester_phone: string | null
  preferred_at: string
  message: string | null
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  created_at: string
  messages?: { id: string; title: string } | null
}

export default function MyBookings() {
  const [rows, setRows] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession()
      if (!sess?.session?.user) {
        router.replace('/login?next=/my/bookings')
        return
      }
      await load()
    })()
  }, [router])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('bookings')
      .select('id, tag_id, requester_name, requester_email, requester_phone, preferred_at, message, status, created_at, messages(id,title)')
      .order('created_at', { ascending: false })
    if (error) {
      console.error(error)
      toast.error('Failed to load bookings')
      setRows([])
    } else {
      setRows((data ?? []) as unknown as Booking[])
    }
    setLoading(false)
  }

  async function setStatus(id: string, status: Booking['status']) {
    const { error } = await supabase.from('bookings').update({ status }).eq('id', id)
    if (error) {
      console.error(error)
      toast.error('Update failed')
    } else {
      toast.success(`Marked as ${status}`)
      await load()
    }
  }

  const pending = useMemo(() => rows.filter(r => r.status === 'pending'), [rows])
  const others  = useMemo(() => rows.filter(r => r.status !== 'pending'), [rows])

  if (loading) return <div className="p-4">Loading…</div>

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">My Bookings</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pending</h2>
        {pending.length === 0 ? <p className="text-sm text-gray-500">No pending bookings.</p> : null}
        {pending.map(b => (
          <article key={b.id} className="border rounded-2xl p-4 bg-white space-y-2">
            <div className="flex justify-between items-start gap-3">
              <div>
                <div className="font-medium">{b.requester_name}</div>
                <div className="text-sm text-gray-600">{b.requester_email}{b.requester_phone ? ` • ${b.requester_phone}` : ''}</div>
                <div className="text-sm text-gray-500">For: {new Date(b.preferred_at).toLocaleString()}</div>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">{b.status}</span>
            </div>
            {b.message ? <p className="text-sm text-gray-700">{b.message}</p> : null}
            <div className="text-xs text-gray-500">Tag: <a className="underline" href={`/tag/${b.tag_id}`}>{b.messages?.title ?? b.tag_id}</a></div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setStatus(b.id, 'accepted')} className="px-3 py-1.5 rounded-xl border bg-black text-white text-sm">Accept</button>
              <button onClick={() => setStatus(b.id, 'declined')} className="px-3 py-1.5 rounded-xl border text-sm">Decline</button>
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">History</h2>
        {others.length === 0 ? <p className="text-sm text-gray-500">No past bookings.</p> : null}
        {others.map(b => (
          <article key={b.id} className="border rounded-2xl p-4 bg-white space-y-2">
            <div className="flex justify-between items-start gap-3">
              <div>
                <div className="font-medium">{b.requester_name}</div>
                <div className="text-sm text-gray-600">{b.requester_email}{b.requester_phone ? ` • ${b.requester_phone}` : ''}</div>
                <div className="text-sm text-gray-500">For: {new Date(b.preferred_at).toLocaleString()}</div>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{b.status}</span>
            </div>
            {b.message ? <p className="text-sm text-gray-700">{b.message}</p> : null}
            <div className="text-xs text-gray-500">Tag: <a className="underline" href={`/tag/${b.tag_id}`}>{b.messages?.title ?? b.tag_id}</a></div>
          </article>
        ))}
      </section>
    </div>
  )
}
