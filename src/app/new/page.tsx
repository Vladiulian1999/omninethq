import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import NewClient from './_client'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) redirect('/login?next=/new')

  const cookieStore = await cookies()

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options)
        })
      },
    },
  })

  const { data, error } = await supabase.auth.getUser()

  // If there is any auth error or no user, force login
  if (error || !data?.user) {
    redirect('/login?next=/new')
  }

  return (
    <Suspense fallback={<div className="p-6 text-gray-500">Loading…</div>}>
      <NewClient />
    </Suspense>
  )
}
