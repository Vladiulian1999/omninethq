'use client'

import { useEffect, useState } from 'react'
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
  const [when, setWhen] = useState<string>('') // datetime-local
  const [msg, setMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  if (!enabled) {
    return (
      <div className="p-4 border rounded-2xl bg-gray-50 text-sm text-gray-600">
        The owner is not accepting bookings right now.
      </div>
    )
  }

  async function submit() {
    if (!name.trim() || !email.trim() || !when) {
      toast.error('Please fill name, email, and date/time.')
      return
    }
    setSubmitting(true)
    try {
      const preferred_at = new Date(when).toISOString()
      const { error } = await supabase.from('bookings').insert([
        {
          tag_id: tagId,
          requester_id: userId ?? null,
          requester_name: name.trim(),
          requester_email: email.trim(),
          requester_phone: phone.trim() || null,
          preferred_at,
          message: msg.trim() || null,
        },
      ])
      if (error) throw error
      toast.success('Booking request sent!')
      setName(''); setEmail(''); setPhone(''); setWhen(''); setMsg('')
    } catch (e: any) {
      console.error(e)
      toast.error('Could not send booking.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-4 border rounded-2xl bg-white space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium">Your name</label>
          <input className="w-full border rounded-xl px-3 py-2"
            value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium">Email</label>
          <input type="email" className="w-full border rounded-xl px-3 py-2"
            value={email} onChange={e => setEmail(e.target.value)} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium">Phone (optional)</label>
          <input className="w-full border rounded-xl px-3 py-2"
            value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium">Preferred date & time</label>
          <input type="datetime-local" className="w-full border rounded-xl px-3 py-2"
            value={when} onChange={e => setWhen(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium">Message (optional)</label>
        <textarea className="w-full border rounded-xl px-3 py-2 min-h-[80px]"
          value={msg} onChange={e => setMsg(e.target.value)} />
      </div>

      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={submitting}
          className="px-4 py-2 rounded-xl border bg-black text-white disabled:opacity-60"
        >
          {submitting ? 'Sending…' : 'Request booking'}
        </button>
      </div>
    </div>
  )
}
