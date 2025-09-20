import { Suspense } from 'react'
import MyBookings from './_client'

export const metadata = { title: 'My Bookings • OmniNet' }

export default function Page() {
  return (
    <Suspense>
      <MyBookings />
    </Suspense>
  )
}
