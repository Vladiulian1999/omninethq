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

async function getUserFromRequest(url: string, anon: string, req: Request) {
  const cookieHeader = req.headers.get('cookie') || ''
  const supabase = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Cookie: cookieHeader } },
  })

  const { data, error } = await supabase.auth.getUser()
  if (data?.user) return { user: data.user, error: null }

  if (error) {
    console.error('ADMIN delete: getUser from cookie failed', error.message)
  }

  const token = getBearerToken(req)
  if (!token) return { user: null, error: error || new Error('No session') }

  const fallback = await supabase.auth.getUser(token)
  if (fallback.error) {
    console.error('ADMIN delete: getUser from bearer failed', fallback.error.message)
    return { user: null, error: fallback.error }
  }

  return { user: fallback.data?.user || null, error: null }
}

function isAdminUser(userId: string) {
  const allow = process.env.ADMIN_USER_IDS
  if (!allow) return false
  const set = new Set(
    allow
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
  return set.has(userId)
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { tagId?: string; id?: string }
    const tagId = body.tagId || body.id
    if (!tagId) return json(400, { ok: false, error: 'Missing tagId' })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !anon || !service) {
      console.error('ADMIN delete: missing envs', {
        hasUrl: !!url,
        hasAnon: !!anon,
        hasService: !!service,
      })
      return json(500, { ok: false, error: 'Server not configured' })
    }

    const { user, error } = await getUserFromRequest(url, anon, req)
    if (!user) {
      console.error('ADMIN delete: missing session', error?.message)
      return json(401, { ok: false, error: 'Unauthorized' })
    }

    console.error('ADMIN delete: user id', user.id)

    if (!process.env.ADMIN_USER_IDS) {
      console.error('ADMIN delete: ADMIN_USER_IDS not set')
    }

    if (!isAdminUser(user.id)) {
      console.error('ADMIN delete: forbidden', user.id)
      return json(403, { ok: false, error: 'Forbidden' })
    }

    const supabaseAdmin = createClient(url, service, { auth: { persistSession: false } })
    const { error: delErr, data } = await supabaseAdmin.rpc('admin_delete_tag_cascade', { p_tag_id: tagId })
    if (delErr) {
      console.error('ADMIN delete: delete failed', delErr.message)
      return json(400, { ok: false, error: delErr.message })
    }

    return json(200, { ok: true, data })
  } catch (e: any) {
    console.error('ADMIN delete: fatal', e?.message || e)
    return json(500, { ok: false, error: e?.message || 'Server error' })
  }
}
