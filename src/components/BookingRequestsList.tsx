'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

type Booking = {
  id: string
  requester_name: string
  requester_email: string
  requester_phone: string | null
  preferred_at: string
  message: string | null
  status: string
  created_at: string
}

export default function BookingRequestsList({ tagId, ownerId }: { tagId: string; ownerId: string }) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id ?? null)
    })
  }, [])

  useEffect(() => {
    if (!userId || userId !== ownerId) return

    const fetchBookings = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('tag_id', tagId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error(error)
        toast.error('❌ Failed to fetch bookings')
      } else {
        setBookings(data as Booking[])
      }
      setLoading(false)
    }

    fetchBookings()
  }, [userId, ownerId, tagId])

  async function updateStatus(id: string, status: 'accepted' | 'declined') {
    const { error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', id)

    if (error) {
      toast.error('❌ Failed to update booking')
    } else {
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status } : b))
      )
      toast.success(`✅ Booking ${status}`)
    }
  }

  if (!userId || userId !== ownerId) return null

  return (
    <div className="mx-auto mt-10 max-w-3xl text-left">
      <h3 className="mb-4 text-xl font-semibold text-white">📋 Booking Requests</h3>
      {loading ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : bookings.length === 0 ? (
        <p className="text-sm italic text-slate-400">No bookings yet.</p>
      ) : (
        <ul className="space-y-4">
          {bookings.map((b) => (
            <li
              key={b.id}
              className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.045] p-4 shadow-sm"
            >
              <div className="flex justify-between items-center">
                <span className="font-medium text-white">
                  {b.requester_name} ({b.requester_email})
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    b.status === 'pending'
                      ? 'border border-yellow-300/25 bg-yellow-300/10 text-yellow-100'
                      : b.status === 'accepted'
                      ? 'border border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
                      : 'border border-red-300/25 bg-red-300/10 text-red-100'
                  }`}
                >
                  {b.status}
                </span>
              </div>
              <p className="text-sm text-slate-300">
                📅 {new Date(b.preferred_at).toLocaleString()}
              </p>
              {b.requester_phone && <p className="text-sm text-slate-300">📞 {b.requester_phone}</p>}
              {b.message && <p className="text-sm text-slate-300">💬 {b.message}</p>}
              <p className="text-xs text-slate-500">
                Submitted {new Date(b.created_at).toLocaleString()}
              </p>

              {b.status === 'pending' && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => updateStatus(b.id, 'accepted')}
                    className="rounded bg-emerald-500/85 px-3 py-1 text-sm text-white transition hover:bg-emerald-400"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => updateStatus(b.id, 'declined')}
                    className="rounded bg-red-500/85 px-3 py-1 text-sm text-white transition hover:bg-red-400"
                  >
                    Decline
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
