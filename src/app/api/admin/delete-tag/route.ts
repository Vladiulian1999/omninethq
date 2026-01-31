import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { tagId?: string; id?: string }
    const tagId = body.tagId || body.id
    if (!tagId) return json(400, { ok: false, step: 'missing_tag_id' })

    const supabase = createRouteHandlerClient({ cookies })
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userData?.user) {
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

    if (!admins.has(userData.user.id.toLowerCase())) {
      return json(403, { ok: false, step: 'not_admin', userId: userData.user.id })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !service) {
      return json(500, { ok: false, step: 'missing_env' })
    }

    const adminClient = createClient(url, service, { auth: { persistSession: false } })
    const { error: delErr } = await adminClient.rpc('admin_delete_tag_cascade', { tag_id: tagId })
    if (delErr) {
      return json(400, { ok: false, step: 'delete_failed', error: delErr.message })
    }

    return json(200, { ok: true })
  } catch (e: any) {
    return json(500, { ok: false, step: 'server_error', error: e?.message || 'Server error' })
  }
}
