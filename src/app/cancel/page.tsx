import { Suspense } from 'react'
import CancelClient from './_client'

export default function CancelPage() {
  return (
    <Suspense fallback={<div>Loading cancellation...</div>}>
      <CancelClient />
    </Suspense>
  )
}
