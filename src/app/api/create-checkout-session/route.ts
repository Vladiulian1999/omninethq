// src/app/api/create-checkout-session/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export const runtime = 'nodejs'

// --- Stripe init ---
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY
if (!STRIPE_KEY) {
  throw new Error('[CONFIG] STRIPE_SECRET_KEY is missing')
}
const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2022-11-15' })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { tagId, refCode = '', amountCents } = body as {
      tagId?: string
      refCode?: string
      amountCents?: number | string
    }

    if (!tagId) {
      return NextResponse.json({ error: 'Missing tagId' }, { status: 400 })
    }

    // --- Amount sanitization & clamping (pence) ---
    // Default £5.00; min £0.50 (Stripe GBP min); max £500.00 for safety
    const DEFAULT = 500
    const MIN = 50
    const MAX = 50000
    let amount = Number.parseInt(String(amountCents), 10)
    if (!Number.isFinite(amount)) amount = DEFAULT
    amount = Math.max(MIN, Math.min(MAX, amount))

    // --- Determine site origin for redirects ---
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.headers.get('origin') ||
      'https://omninethq.co.uk'

    // --- Create checkout session ---
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `Support Tag ${tagId}`,
              description: 'Donate to support this service tag on OmniNet',
            },
            unit_amount: amount, // pence
          },
          quantity: 1,
        },
      ],
      client_reference_id: `${tagId}${refCode ? `:${refCode}` : ''}`,
      metadata: {
        tag_id: tagId,
        ref_code: String(refCode || ''),
        amount_cents: String(amount),
      },
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}&tag=${encodeURIComponent(
        tagId
      )}`,
      cancel_url: `${origin}/cancel?status=canceled&tag=${encodeURIComponent(tagId)}`,
    })

    return NextResponse.json({ id: session.id, url: session.url })
  } catch (e: any) {
    console.error('[STRIPE_SESSION_ERROR]', e)
    return NextResponse.json(
      { error: e?.message ?? 'Stripe error' },
      { status: 500 }
    )
  }
}
