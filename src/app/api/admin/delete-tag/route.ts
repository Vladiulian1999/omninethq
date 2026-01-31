export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function getBearerToken(req: Request) {
  const auth = req.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return null
  return auth.slice(7).trim()
}

async function getUserId(url: string, anon: string, token: string) {
  const supabase = createClient(url, anon, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user.id
}

async function isAdminUser(url: string, service: string, userId: string) {
  const allow = process.env.ADMIN_USER_IDS
  if (allow) {
    const set = new Set(
      allow
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
    if (set.has(userId)) return true
  }

  const supabase = createClient(url, service, { auth: { persistSession: false } })
  const { data, error } = await supabase
    .from('admin_user_ids')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return false
  return !!data
}

export async function POST(req: Request) {
  try {
    const { id } = (await req.json().catch(() => ({}))) as { id?: string }
    if (!id) return json(400, { error: 'Missing tag id' })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !anon || !service) return json(500, { error: 'Server not configured' })

    const token = getBearerToken(req)
    if (!token) return json(401, { error: 'Unauthorized' })

    const userId = await getUserId(url, anon, token)
    if (!userId) return json(401, { error: 'Unauthorized' })

    const isAdmin = await isAdminUser(url, service, userId)
    if (!isAdmin) return json(403, { error: 'Forbidden' })

    const supabaseAdmin = createClient(url, service, { auth: { persistSession: false } })
    const { error, count } = await supabaseAdmin
      .from('messages')
      .delete({ count: 'exact' })
      .eq('id', id)
    if (error) return json(400, { error: error.message })
    if (!count) return json(404, { error: 'Tag not deleted' })

    return json(200, { success: true })
  } catch (e: any) {
    return json(500, { error: e?.message || 'Server error' })
  }
}
