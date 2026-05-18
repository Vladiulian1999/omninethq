'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import Link from 'next/link'

type Props = {
  tagId: string
  enabled: boolean
}

type BookingFlowMode = 'book' | 'reserve' | 'order' | 'enquire'

type BookingContext = {
  mode: BookingFlowMode
  blockId?: string | null
  title?: string | null
  startAt?: string | null
  endAt?: string | null
}

function getContextKey(tagId: string) {
  return `omni_booking_ctx_${tagId}`
}

function fmtWindow(startAt?: string | null, endAt?: string | null) {
  if (!startAt && !endAt) return null

  const start = startAt ? new Date(startAt) : null
  const end = endAt ? new Date(endAt) : null

  const safe = (d: Date | null) => {
    if (!d || Number.isNaN(d.getTime())) return null
    return d.toLocaleString()
  }

  const s = safe(start)
  const e = safe(end)

  if (s && e) return `${s} → ${e}`
  return s || e
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
  const [ctx, setCtx] = useState<BookingContext | null>(null)

  const nextPath =
    typeof window !== 'undefined' ? window.location.pathname : `/tag/${tagId}`

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id ?? null)
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const raw = sessionStorage.getItem(getContextKey(tagId))
      if (!raw) {
        setCtx(null)
        return
      }

      const parsed = JSON.parse(raw) as BookingContext
      setCtx(parsed)

      if (parsed.mode !== 'book' && parsed.startAt) {
        setPreferredAt(parsed.startAt)
      }
    } catch {
      setCtx(null)
    }
  }, [tagId])

  const mode: BookingFlowMode = ctx?.mode || 'book'
  const isBookingMode = mode === 'book'
  const isReserveLike = mode === 'reserve' || mode === 'order' || mode === 'enquire'
  const reservedWindow = useMemo(
    () => fmtWindow(ctx?.startAt, ctx?.endAt),
    [ctx?.startAt, ctx?.endAt]
  )

  if (!enabled) {
    return (
      <p className="text-sm italic text-slate-400">
        📌 This owner is not currently accepting bookings.
      </p>
    )
  }

  if (!userId) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-6 shadow-sm">
        <p className="text-sm text-slate-300">
          🚪 Please{' '}
          <Link
            className="font-medium text-cyan-100 underline underline-offset-2"
            href={`/login?next=${encodeURIComponent(nextPath)}`}
          >
            log in
          </Link>{' '}
          to continue.
        </p>
      </div>
    )
  }

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Please enter your name')
      return
    }

    if (isBookingMode) {
      if (!email.trim() || !preferredAt) {
        toast.error('Please fill in name, email, and date/time')
        return
      }
    }

    setLoading(true)

    try {
      const derivedPreferredAt =
        isBookingMode
          ? new Date(preferredAt).toISOString()
          : ctx?.startAt
            ? new Date(ctx.startAt).toISOString()
            : null

      const payload = {
        tag_id: tagId,
        requester_name: name.trim(),
        requester_email: email.trim() || null,
        requester_phone: phone.trim() || null,
        preferred_at: derivedPreferredAt,
        message: message.trim() || null,
        status: 'pending',
      }

      const { error } = await supabase.from('bookings').insert([payload])

      if (error) throw error

      setSuccess(true)
      toast.success(
        isBookingMode ? '🎉 Booking request sent!' : '🎉 Reservation details sent!'
      )
    } catch (err) {
      console.error(err)
      toast.error('❌ Failed to submit request')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-8 text-center shadow-md">
        <div className="flex justify-center mb-4">
          <svg
            className="h-16 w-16 animate-bounce text-emerald-200"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h3 className="mb-2 text-lg font-semibold text-white">
          {isBookingMode ? 'Request Sent Successfully!' : 'Reservation Sent Successfully!'}
        </h3>

        <p className="mb-4 text-sm text-slate-300">
          {isBookingMode
            ? "We've received your booking request."
            : "We've received your reservation details."}
          {email ? (
            <>
              {' '}You’ll hear back soon at <span className="font-medium">{email}</span>.
            </>
          ) : null}
        </p>

        <div className="space-y-1 text-sm text-slate-400">
          {reservedWindow && <p>🕒 {reservedWindow}</p>}
          {preferredAt && isBookingMode && <p>📅 {new Date(preferredAt).toLocaleString()}</p>}
          {phone && <p>📞 {phone}</p>}
          {message && <p>💬 {message}</p>}
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={submitBooking}
      className="mx-auto max-w-2xl space-y-6 rounded-2xl border border-white/10 bg-white/[0.045] p-6 text-left shadow-md"
    >
      <div>
        <h3 className="mb-2 text-lg font-semibold text-white">
          {isBookingMode ? '👤 Contact Info' : '👤 Reservation Details'}
        </h3>
        <p className="mb-4 text-xs text-slate-400">
          {isBookingMode
            ? 'We’ll use these details to confirm your booking.'
            : 'Add your name so the owner can match this reservation to you.'}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-200">Your Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="omni-input w-full rounded-lg px-3 py-2 shadow-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200">
              {isBookingMode ? 'Email *' : 'Email (optional)'}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="omni-input w-full rounded-lg px-3 py-2 shadow-sm"
              required={isBookingMode}
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-sm font-medium text-slate-200">Phone (optional)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="omni-input w-full rounded-lg px-3 py-2 shadow-sm"
          />
        </div>
      </div>

      {isBookingMode ? (
        <div>
          <h3 className="mb-2 text-lg font-semibold text-white">📅 Appointment</h3>
          <p className="mb-4 text-xs text-slate-400">Choose your preferred date and time.</p>
          <input
            type="datetime-local"
            value={preferredAt}
            onChange={(e) => setPreferredAt(e.target.value)}
            className="omni-input w-full rounded-lg px-3 py-2 shadow-sm"
            required
          />
        </div>
      ) : (
        <div>
          <h3 className="mb-2 text-lg font-semibold text-white">🕒 Live Availability</h3>
          <p className="mb-4 text-xs text-slate-400">
            This reservation uses the time window already attached to the live availability.
          </p>
          <div className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-3 text-sm text-slate-300">
            {reservedWindow || 'This availability is active now.'}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-lg font-semibold text-white">💬 Extra Notes</h3>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="omni-input w-full rounded-lg px-3 py-2 shadow-sm"
          rows={4}
          placeholder={
            isBookingMode
              ? 'Any extra details the owner should know?'
              : 'Optional note for the owner'
          }
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="omni-button-primary w-full rounded-lg py-3 font-semibold disabled:opacity-50"
      >
        {loading
          ? 'Sending…'
          : isBookingMode
            ? '🚀 Send Booking Request'
            : '🚀 Confirm Reservation Details'}
      </button>
    </form>
  )
}
