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
  //      Notice the `await` here—this ensures `cookieStore` is a
  //      ReadonlyRequestCookies, not a Promise<ReadonlyRequestCookies>.
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
        get: (name: string) => {
          // Now `cookieStore.get(name)` is valid because `cookieStore` isn’t a Promise
          return cookieStore.get(name)?.value ?? null
        },
        set: () => {
          // no-op (we only need `.get(...)` here)
        },
        remove: () => {
          // no-op
        },
      },
    }
  )

  //
  // ─── 3. GET THE CURRENT SESSION (IF ANY) FROM SUPABASE ────────────────────
  //      We also `await` getSession() so that `session` is not a Promise.
  //
  const {
    data: { session },
  } = await supabase.auth.getSession()

  //
  // ─── 4. PASS `session` (which contains access_token & refresh_token) ───────
  //
  return <UserClientPage params={params} session={session} />
}

