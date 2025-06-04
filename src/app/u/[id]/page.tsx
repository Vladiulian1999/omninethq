import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import UserClientPage from './_client'

export default async function UserPageWrapper({
  params,
}: {
  params: { id: string }
}) {
  // ▶️ Use `await cookies()` so that `cookieStore` is a ReadonlyRequestCookies
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Now `cookieStore.get(name)` works because `cookieStore` is NOT a Promise
        get: (name: string) => {
          return cookieStore.get(name)?.value ?? null
        },
        set: () => {
          /* no-op */
        },
        remove: () => {
          /* no-op */
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  return <UserClientPage params={params} session={session} />
}
