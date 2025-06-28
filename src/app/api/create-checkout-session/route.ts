import { NextResponse } from 'next/server'
import Stripe from 'stripe'

export const runtime = 'nodejs'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2022-11-15',
})

export async function POST(req: Request) {
  try {
    const { tagId } = await req.json()

    if (!tagId) {
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
      metadata: { tag_id: tagId },
      success_url: `${process.env.NEXT_PUBLIC_STRIPE_SUCCESS_URL}?tag=${tagId}`,
      cancel_url: `${process.env.NEXT_PUBLIC_STRIPE_CANCEL_URL}?tag=${tagId}`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[STRIPE SESSION ERROR]', error?.message || error)
    return NextResponse.json(
      { error: 'Failed to create Stripe session' },
      { status: 500 }
    )
  }
}
