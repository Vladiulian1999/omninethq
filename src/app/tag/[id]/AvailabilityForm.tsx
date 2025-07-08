'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function AvailabilityForm({
  tagId,
  userId,
  initialAvailability = []
}: {
  tagId: string
  userId: string
  initialAvailability?: any[]
}) {

  const [day, setDay] = useState('Monday')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [slots, setSlots] = useState<any[]>([])

  useEffect(() => {
    if (initialAvailability?.length > 0) {
      setSlots(initialAvailability)
    }
  }, [initialAvailability])

  const submitAvailability = async () => {
    setLoading(true)
    setMessage('')

    const { error } = await supabase.from('availability').upsert({
      tag_id: tagId,
      user_id: userId,
      day: day,
      times: [`${startTime} - ${endTime}`]
    })

    if (error) {
      setMessage(`❌ ${error.message}`)
    } else {
      setMessage('✅ Availability saved!')

      // update UI state
      const updated = [...slots.filter((s) => s.day !== day), {
        tag_id: tagId,
        user_id: userId,
        day,
        times: [`${startTime} - ${endTime}`],
      }]
      setSlots(updated)
    }

    setLoading(false)
  }

  return (
    <div className="border rounded-xl bg-white shadow p-4">
      <h3 className="text-lg font-semibold mb-2">Set Weekly Availability</h3>
      <div className="flex flex-col gap-3">
        <select
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="border p-2 rounded"
        >
          {daysOfWeek.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="border p-2 rounded"
        />
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="border p-2 rounded"
        />
        <button
          onClick={submitAvailability}
          disabled={loading}
          className="bg-black text-white py-2 px-4 rounded hover:bg-gray-800 transition"
        >
          {loading ? 'Saving...' : 'Save Slot'}
        </button>
        {message && <p className="text-sm mt-1">{message}</p>}
      </div>

      {slots.length > 0 && (
        <div className="mt-6">
          <h4 className="font-medium mb-2">📅 Your Set Availability</h4>
          <ul className="text-left text-sm space-y-1">
            {slots.map((slot, i) => (
              <li key={i}>✅ <strong>{slot.day}</strong>: {slot.times.join(', ')}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
