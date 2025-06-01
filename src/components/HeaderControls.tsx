'use client'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useEffect, useState } from 'react'

export default function HeaderControls() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)
    }

    getUser()

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserId(session.user.id)
      } else {
        setUserId(null)
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
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
