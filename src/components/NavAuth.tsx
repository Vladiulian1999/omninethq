'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function NavAuth() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (signedIn === null) return null

  return (
    <div className="flex items-center gap-2">
      {signedIn ? (
        <>
          <Link href="/profile" className="px-3 py-1.5 rounded-xl border">Profile</Link>
          <button
            className="px-3 py-1.5 rounded-xl border"
            onClick={async () => { await supabase.auth.signOut(); location.href='/' }}
          >
            Logout
          </button>
        </>
      ) : (
        <Link href="/login" className="px-3 py-1.5 rounded-xl border">Login</Link>
      )}
    </div>
  )
}
