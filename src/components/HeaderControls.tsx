'use client'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useEffect, useState } from 'react'

export default function HeaderControls() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)
    }
    fetchUser()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (!userId) return null

  return (
    <div className="flex gap-4 items-center">
      <button
        onClick={() => router.push(`/edit/${userId}`)}
        className="text-sm px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
      >
        Edit Profile
      </button>
      <button
        onClick={handleLogout}
        className="text-sm px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600"
      >
        Logout
      </button>
    </div>
  )
}
