import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE(_KEY) is missing')

  return createClient(url, key, { auth: { persistSession: false } })
}

function cleanText(value: unknown, maxLength = 1000) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text.slice(0, maxLength) : null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)

    const name = cleanText(body?.name, 160)
    const email = cleanText(body?.email, 254)?.toLowerCase()
    const businessType = cleanText(body?.businessType, 180)
    const biggestProblem = cleanText(body?.biggestProblem, 2000)

    if (!name || !email) {
      return NextResponse.json(
        { ok: false, error: 'Please enter your name and email.' },
        { status: 400 }
      )
    }

    if (!emailPattern.test(email)) {
      return NextResponse.json(
        { ok: false, error: 'Please enter a valid email address.' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()
    const { error } = await supabase.from('commitment_waitlist').insert({
      name,
      email,
      business_type: businessType,
      biggest_problem: biggestProblem,
    })

    if (error?.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 })
    }

    if (error) {
      console.error('[commitment-waitlist] insert error:', error.message)
      return NextResponse.json(
        { ok: false, error: 'We could not save your signup right now. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('[commitment-waitlist] failed:', error)
    return NextResponse.json(
      { ok: false, error: 'We could not save your signup right now. Please try again.' },
      { status: 500 }
    )
  }
}
