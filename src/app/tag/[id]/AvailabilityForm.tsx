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
    if (initialAvailability && Array.isArray(initialAvailability)) {
      setSlots(initialAvailability)
    }
  }, [initialAvailability])

  const refreshSlots = async () => {
    const { data } = await supabase
      .from('availability')
      .select('*')
      .eq('tag_id', tagId)
      .eq('user_id', userId)

    setSlots(data || [])
  }

  const submitAvailability = async () => {
    setLoading(true)
    setMessage('')

    const { error } = await supabase.from('availability').upsert({
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
      await refreshSlots()
    }

    setLoading(false)
  }

  const deleteSlot = async (dayOfWeek: string) => {
    const { error } = await supabase
      .from('availability')
      .delete()
      .eq('tag_id', tagId)
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek)

    if (error) {
      setMessage(`❌ ${error.message}`)
    } else {
      setMessage('🗑️ Availability removed')
      await refreshSlots()
    }
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

      {slots.length > 0 && (
        <div className="mt-6">
          <h4 className="font-medium mb-2">📅 Your Set Availability</h4>
          <ul className="text-left text-sm space-y-2">
            {slots.map((slot, i) => (
              <li key={i} className="flex items-center justify-between">
                <span>
                  ✅ <strong>{slot.day_of_week}</strong>: {slot.start_time} – {slot.end_time}
                </span>
                <button
                  onClick={() => deleteSlot(slot.day_of_week)}
                  className="text-red-500 hover:underline text-xs ml-2"
                >
                  ❌ Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
