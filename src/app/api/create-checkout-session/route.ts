import Stripe from 'stripe'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2022-11-15', // ✅ safest version matching types
})

export async function POST(req: Request) {
  try {
    const { tagId } = await req.json()

    if (!tagId) {
      console.error('[MISSING_TAG_ID]')
      return NextResponse.json({ error: 'Missing tagId' }, { status: 400 })
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `Support Tag ${tagId}`,
              description: 'Donate to support this service tag on OmniNet',
            },
            unit_amount: 500, // £5.00
          },
          quantity: 1,
        },
      ],
      metadata: {
        tag_id: tagId,
      },
      success_url: `${process.env.NEXT_PUBLIC_STRIPE_SUCCESS_URL}?tag=${tagId}`,
      cancel_url: `${process.env.NEXT_PUBLIC_STRIPE_CANCEL_URL}?tag=${tagId}`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('[STRIPE_SESSION_ERROR]', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
