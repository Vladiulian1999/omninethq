import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import UserClientPage from './_client'

export default async function UserPageWrapper({ params }: { params: { id: string } }) {
  // ✅ Add await — cookies() is now async in newer Next.js versions
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value ?? null
        },
        set() {},
        remove() {},
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { data: tagData, error: tagError } = await supabase
    .from('messages')
    .select('id, title, description, category, views, featured, created_at')
    .eq('user_id', params.id)
    .order('created_at', { ascending: false })

  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('email, username, avatar_url, bio')
    .eq('id', params.id)
    .maybeSingle()

  if (tagError || userError) {
    return <div className="p-10 text-center text-red-600">Error: {tagError?.message || userError?.message}</div>
  }

  return (
    <UserClientPage
      params={params}
      session={session}
      initialUser={userData}
      initialTags={tagData || []}
    />
  )
}
