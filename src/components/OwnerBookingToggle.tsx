'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

type Props = {
  tagId: string
  tagOwnerId: string
  initialEnabled: boolean
}

export default function OwnerBookingToggle({ tagId, tagOwnerId, initialEnabled }: Props) {
  const [me, setMe] = useState<string | null>(null)
  const [enabled, setEnabled] = useState<boolean>(initialEnabled)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null))
  }, [])

  // Only owners can see this toggle
  if (!me || me !== tagOwnerId) return null

  async function onToggle(next: boolean) {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('messages')
        .update({ bookings_enabled: next })
        .eq('id', tagId)
      if (error) throw error
      setEnabled(next)
      toast.success(next ? 'Bookings enabled' : 'Bookings disabled')
    } catch (e) {
      console.error(e)
      toast.error('Failed to update bookings setting')
    } finally {
      setSaving(false)
    }
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm select-none">
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={enabled}
        disabled={saving}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span>Accept bookings</span>
    </label>
  )
}
