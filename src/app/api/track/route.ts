import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL missing')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE(_KEY) missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

function cleanId(v: any) {
  return (v ?? '').toString().trim().replace(/[<>\s]/g, '')
}
function cleanStr(v: any) {
  const s = (v ?? '').toString().trim()
  return s.length ? s : null
}

async function resolveLiveBlock(supabase: ReturnType<typeof getServiceSupabase>, tagId: string) {
  const nowIso = new Date().toISOString()
  const { data } = await supabase
    .from('availability_blocks')
    .select('id, owner_id')
    .eq('tag_id', tagId)
    .eq('status', 'live')
    .lte('start_at', nowIso)
    .gt('end_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    block_id: (data as any)?.id ?? null,
    owner_id: (data as any)?.owner_id ?? null,
  }
}

// ✅ Validate explicit block_id belongs to the tag AND is currently live.
// If invalid, we ignore it and fall back to server-resolved live block.
async function validateExplicitLiveBlock(
  supabase: ReturnType<typeof getServiceSupabase>,
  tagId: string,
  explicitBlockId: string
): Promise<string | null> {
  const nowIso = new Date().toISOString()

  const { data } = await supabase
    .from('availability_blocks')
    .select('id')
    .eq('id', explicitBlockId)
    .eq('tag_id', tagId)
    .eq('status', 'live')
    .lte('start_at', nowIso)
    .gt('end_at', nowIso)
    .limit(1)
    .maybeSingle()

  return (data as any)?.id ?? null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const evt = cleanStr(body?.evt)
    const payload = body?.payload || {}

    const tagId = cleanId(payload?.tag_id)
    if (!evt || !tagId) {
      // Do not hard-fail client UX on analytics
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const supabase = getServiceSupabase()

    // Server-truth live block
    const live = await resolveLiveBlock(supabase, tagId)

    // Referrer header fallback
    const refHdr = req.headers.get('referer') || req.headers.get('referrer') || null

    // Client-provided block_id (only accepted if validated)
    const explicitBlockId =
      payload?.meta && typeof payload.meta === 'object' && payload.meta?.block_id
        ? cleanId(payload.meta.block_id)
        : null

    let finalBlockId = live.block_id

    // If client provided a block_id, validate it belongs to this tag and is live now
    if (explicitBlockId) {
      const valid = await validateExplicitLiveBlock(supabase, tagId, explicitBlockId)
      if (valid) finalBlockId = valid
    }

    const insertRow = {
      event: evt,
      tag_id: tagId,
      block_id: finalBlockId,
      owner_id: payload?.owner_id ?? live.owner_id,
      user_id: payload?.user_id ?? null,
      anon_id: cleanStr(payload?.anon_id),
      experiment_id: cleanStr(payload?.experiment_id),
      variant: cleanStr(payload?.variant),
      channel: cleanStr(payload?.channel),
      referrer: cleanStr(payload?.referrer) ?? refHdr,
      meta: payload?.meta ?? {},
    }

    const { error } = await supabase.from('analytics_events').insert(insertRow)
    if (error) console.warn('[track] insert error:', error.message)

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: any) {
    console.warn('[track] failed:', e?.message || e)
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}