'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

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

  if (!enabled) {
    return (
      <p className="text-sm text-gray-500">
        The owner is not currently accepting bookings.
      </p>
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
      const { data, error } = await supabase.from('bookings').insert([
        {
          tag_id: tagId,
          requester_name: name,
          requester_email: email,
          requester_phone: phone || null,
          preferred_at: preferredAt,
          message: message || null,
          status: 'pending',
        },
      ])

      if (error) throw error
      toast.success('Booking request sent!')
      // Reset form
      setName('')
      setEmail('')
      setPhone('')
      setPreferredAt('')
      setMessage('')
    } catch (err) {
      console.error(err)
      toast.error('Failed to submit booking')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={submitBooking}
      className="space-y-3 p-4 border rounded-2xl bg-white shadow"
    >
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
