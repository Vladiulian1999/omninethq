// src/app/u/[id]/page.tsx

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import UserClientPage from './_client'

export default async function UserPageWrapper({
  params,
}: {
  params: { id: string }
}) {
  //
  // ─── 1. FETCH THE COOKIE OBJECT ─────────────────────────────────────────
  //      We `await cookies()` so that `cookieStore` is a ReadonlyRequestCookies,
  //      not a Promise. This is exactly what Supabase needs for server‐side auth.
  //
  const cookieStore = await cookies()

  //
  // ─── 2. BUILD A SUPABASE SERVER CLIENT WITH COOKIE-BASED AUTH ───────────
  //
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value ?? null,
        set: () => {
          /* no-op */
        },
        remove: () => {
          /* no-op */
        },
      },
    }
  )

  //
  // ─── 3. GET THE CURRENT SESSION (IF ANY) ─────────────────────────────────
  //
  const {
    data: { session },
  } = await supabase.auth.getSession()

  //
  // ─── 4. RENDER THE CLIENT COMPONENT, PASSING `session` AND `params` ───────
  //
  return <UserClientPage params={params} session={session} />
}



