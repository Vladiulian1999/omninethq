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
  const [success, setSuccess] = useState(false)

  const nextPath =
    typeof window !== 'undefined' ? window.location.pathname : `/tag/${tagId}`

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id ?? null)
    })
  }, [])

  if (!enabled) {
    return (
      <p className="text-sm text-gray-500 italic">
        📌 This owner is not currently accepting bookings.
      </p>
    )
  }

  if (!userId) {
    return (
      <div className="p-6 border rounded-2xl bg-gradient-to-r from-gray-50 to-white shadow-sm">
        <p className="text-sm text-gray-700">
          🚪 Please{' '}
          <Link
            className="text-blue-600 underline font-medium"
            href={`/login?next=${encodeURIComponent(nextPath)}`}
          >
            log in
          </Link>{' '}
          to request a booking.
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
      setSuccess(true)
      toast.success('🎉 Booking request sent!')
    } catch (err) {
      console.error(err)
      toast.error('❌ Failed to submit booking')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="p-8 border rounded-2xl bg-gradient-to-br from-green-50 to-white shadow-md text-center">
        {/* Animated checkmark */}
        <div className="flex justify-center mb-4">
          <svg
            className="w-16 h-16 text-green-600 animate-bounce"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-green-700 mb-2">
          Request Sent Successfully!
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          We’ve received your booking request. You’ll hear back soon at{' '}
          <span className="font-medium">{email}</span>.
        </p>
        <div className="text-sm text-gray-500">
          <p>📅 {new Date(preferredAt).toLocaleString()}</p>
          {phone && <p>📞 {phone}</p>}
          {message && <p>💬 {message}</p>}
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={submitBooking}
      className="space-y-6 p-6 border rounded-2xl bg-gradient-to-br from-white via-gray-50 to-gray-100 shadow-md text-left max-w-2xl mx-auto"
    >
      {/* Contact Info */}
      <div>
        <h3 className="text-lg font-semibold mb-2">👤 Contact Info</h3>
        <p className="text-xs text-gray-500 mb-4">We’ll use these details to confirm your booking.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Your Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg shadow-sm focus:ring focus:ring-blue-200"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg shadow-sm focus:ring focus:ring-blue-200"
              required
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-sm font-medium">Phone (optional)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg shadow-sm focus:ring focus:ring-blue-200"
          />
        </div>
      </div>

      {/* Appointment */}
      <div>
        <h3 className="text-lg font-semibold mb-2">📅 Appointment</h3>
        <p className="text-xs text-gray-500 mb-4">Choose your preferred date and time.</p>
        <input
          type="datetime-local"
          value={preferredAt}
          onChange={(e) => setPreferredAt(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg shadow-sm focus:ring focus:ring-blue-200"
          required
        />
      </div>

      {/* Extra Notes */}
      <div>
        <h3 className="text-lg font-semibold mb-2">💬 Extra Notes</h3>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg shadow-sm focus:ring focus:ring-blue-200"
          rows={4}
          placeholder="Any extra details the owner should know?"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg shadow-md hover:from-blue-700 hover:to-indigo-700 transition disabled:opacity-50"
      >
        {loading ? 'Sending Request…' : '🚀 Send Booking Request'}
      </button>
    </form>
  )
}
