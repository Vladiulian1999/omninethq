'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function NavAuth() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const { data } = await supabase.auth.getUser()
      if (mounted) {
        setUserId(data?.user?.id ?? null)
        setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  if (loading) return null

  return (
    <div className="flex items-center gap-2">
      {/* Create is always visible; /new already protects/redirects */}
      <Link
        href="/new"
        className="px-3 py-1.5 rounded bg-black text-white text-sm hover:bg-gray-800"
      >
        Create
      </Link>

      {userId ? (
        <>
          <Link
            href="/my"
            className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm hover:bg-black"
          >
            My
          </Link>
          <Link
            href={`/u/${userId}`}
            className="px-3 py-1.5 rounded bg-gray-200 text-sm hover:bg-gray-300"
          >
            Profile
          </Link>
          <Link
            href="/logout"
            className="px-3 py-1.5 rounded bg-gray-200 text-sm hover:bg-gray-300"
          >
            Logout
          </Link>
        </>
      ) : (
        <Link
          href="/login"
          className="px-3 py-1.5 rounded bg-gray-200 text-sm hover:bg-gray-300"
        >
          Login
        </Link>
      )}
    </div>
  )
}
