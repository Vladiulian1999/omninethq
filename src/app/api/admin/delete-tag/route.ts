export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function getUserFromCookies(url: string, anon: string, req: Request) {
  const cookieHeader = req.headers.get('cookie') || ''
  const supabase = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Cookie: cookieHeader } },
  })
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return null
  return data.user
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { tagId?: string; id?: string }
    const tagId = body.tagId || body.id
    if (!tagId) return json(400, { ok: false, step: 'missing_tag_id' })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !anon || !service) {
      return json(500, { ok: false, step: 'missing_env' })
    }

    const user = await getUserFromCookies(url, anon, req)
    if (!user) {
      return json(401, { ok: false, step: 'no_user' })
    }

    const allow = process.env.ADMIN_USER_IDS
    if (!allow) {
      return json(403, { ok: false, step: 'missing_admin_env' })
    }

    const admins = new Set(
      allow
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    )

    if (!admins.has(user.id.toLowerCase())) {
      return json(403, { ok: false, step: 'not_admin', userId: user.id })
    }

    const supabaseAdmin = createClient(url, service, { auth: { persistSession: false } })
    const { error: delErr, data } = await supabaseAdmin.rpc('admin_delete_tag_cascade', { tag_id: tagId })
    if (delErr) {
      return json(400, { ok: false, step: 'delete_failed', error: delErr.message })
    }

    return json(200, { ok: true, data })
  } catch (e: any) {
    return json(500, { ok: false, step: 'server_error', error: e?.message || 'Server error' })
  }
}
