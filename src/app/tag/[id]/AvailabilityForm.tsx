'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function AvailabilityForm({ tagId, userId }: { tagId: string; userId: string }) {
  const [day, setDay] = useState('Monday')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const submitAvailability = async () => {
    setLoading(true)
    setMessage('')

    const { error } = await supabase.from('availability').insert({
      tag_id: tagId,
      user_id: userId,
      day_of_week: day,
      start_time: startTime,
      end_time: endTime,
    })

    if (error) {
      setMessage(`❌ ${error.message}`)
    } else {
      setMessage('✅ Availability saved!')
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
            <option key={d} value={d}>
              {d}
            </option>
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
    </div>
  )
}
