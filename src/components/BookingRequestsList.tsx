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
    <div className="mt-10 text-left max-w-3xl mx-auto">
      <h3 className="text-xl font-semibold mb-4">📋 Booking Requests</h3>
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : bookings.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No bookings yet.</p>
      ) : (
        <ul className="space-y-4">
          {bookings.map((b) => (
            <li
              key={b.id}
              className="p-4 border rounded-xl bg-white shadow-sm flex flex-col gap-2"
            >
              <div className="flex justify-between items-center">
                <span className="font-medium">
                  {b.requester_name} ({b.requester_email})
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    b.status === 'pending'
                      ? 'bg-yellow-100 text-yellow-800'
                      : b.status === 'accepted'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {b.status}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                📅 {new Date(b.preferred_at).toLocaleString()}
              </p>
              {b.requester_phone && <p className="text-sm">📞 {b.requester_phone}</p>}
              {b.message && <p className="text-sm">💬 {b.message}</p>}
              <p className="text-xs text-gray-400">
                Submitted {new Date(b.created_at).toLocaleString()}
              </p>

              {b.status === 'pending' && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => updateStatus(b.id, 'accepted')}
                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => updateStatus(b.id, 'declined')}
                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
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
