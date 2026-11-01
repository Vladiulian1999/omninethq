import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { isSameOriginMutation } from '@/lib/same-origin-mutation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const json = (status: number, error: string) =>
    NextResponse.json({ ok: false, error }, { status })

  try {
    const authClient = await getSupabaseServer()
    const { data, error } = await authClient.auth.getUser()
    if (error || !data.user) return json(401, 'UNAUTHENTICATED')
    if (!isSameOriginMutation(req)) return json(403, 'FORBIDDEN')

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return json(400, 'INVALID_REQUEST')
    }
    const tagId = body && typeof body === 'object' && 'tag_id' in body
      && typeof body.tag_id === 'string' ? body.tag_id.trim() : ''
    if (!tagId || tagId.length > 256) return json(400, 'INVALID_REQUEST')

    // Separate privileged client: never use service access to infer authority.
    const admin = getSupabaseAdmin()
    const { data: message, error: lookupError } = await admin
      .from('messages').select('id, user_id').eq('id', tagId).maybeSingle()
    if (lookupError) return json(500, 'DELETE_FAILED')
    if (!message || !message.user_id || message.user_id !== data.user.id) {
      return json(403, 'FORBIDDEN')
    }

    const { data: deleted, error: deleteError } = await admin
      .rpc('delete_tag_cascade', { tag_id: message.id })
    if (deleteError || !deleted) return json(500, 'DELETE_FAILED')
    return NextResponse.json({ ok: true })
  } catch {
    return json(500, 'DELETE_FAILED')
  }
}
