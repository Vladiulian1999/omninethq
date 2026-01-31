'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

export default function HeaderControls() {
  const router = useRouter()
  const supabase = useMemo(() => getSupabaseBrowser(), [])

  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (!mounted) return
      if (error || !data?.user) setUserId(null)
      else setUserId(data.user.id)
    }

    init()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setUserId(session?.user?.id ?? null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/')
    router.refresh()
  }

  return userId ? (
    <div className="flex gap-4 items-center">
      <button
        onClick={() => router.push(`/u/${userId}`)}
        className="text-sm px-4 py-2 bg-gray-200 text-black rounded hover:bg-gray-300"
      >
        View Profile
      </button>

      <button
        onClick={() => router.push(`/profile/edit`)}
        className="text-sm px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Edit Profile
      </button>

      <button
        onClick={handleLogout}
        className="text-sm px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
      >
        Logout
      </button>
    </div>
  ) : (
    <button
      onClick={() => router.push('/login')}
      className="text-sm px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
    >
      Login
    </button>
  )
}
