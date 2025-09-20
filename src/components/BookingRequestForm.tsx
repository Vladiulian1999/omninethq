'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import Link from 'next/link'

type Props = {
  tagId: string
  enabled: boolean
}

export default function BookingRequestForm({ tagId, enabled }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [preferredAt, setPreferredAt] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const nextPath =
    typeof window !== 'undefined' ? window.location.pathname : `/tag/${tagId}`

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id ?? null)
    })
  }, [])

  if (!enabled) {
    return (
      <p className="text-sm text-gray-500">
        The owner is not currently accepting bookings.
      </p>
    )
  }

  // RLS requires authenticated; show a friendly login CTA
  if (!userId) {
    return (
      <div className="p-4 border rounded-2xl bg-white">
        <p className="text-sm text-gray-700">
          Please <Link className="text-blue-600 underline" href={`/login?next=${encodeURIComponent(nextPath)}`}>log in</Link> to request a booking.
        </p>
      </div>
    )
  }

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !email || !preferredAt) {
      toast.error('Please fill in name, email, and date/time')
      return
    }

    setLoading(true)
    try {
      // requester_id is set by DB trigger; do NOT send it here
      const { error } = await supabase.from('bookings').insert([
        {
          tag_id: tagId,
          requester_name: name.trim(),
          requester_email: email.trim(),
          requester_phone: phone.trim() || null,
          preferred_at: new Date(preferredAt).toISOString(),
          message: message.trim() || null,
          status: 'pending',
        },
      ])

      if (error) throw error
      toast.success('Booking request sent!')
      setName(''); setEmail(''); setPhone(''); setPreferredAt(''); setMessage('')
    } catch (err) {
      console.error(err)
      toast.error('Failed to submit booking')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submitBooking} className="space-y-3 p-4 border rounded-2xl bg-white shadow">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium">Your Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Email *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            required
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Preferred Date/Time *</label>
          <input
            type="datetime-local"
            value={preferredAt}
            onChange={(e) => setPreferredAt(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full px-3 py-2 border rounded"
          rows={3}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 bg-blue-600 text-white rounded disabled:opacity-50"
      >
        {loading ? 'Sending…' : 'Request Booking'}
      </button>
    </form>
  )
}
