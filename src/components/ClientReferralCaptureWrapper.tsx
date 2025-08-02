'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

// Load the actual component with SSR disabled
const ClientReferralCapture = dynamic(() => import('./ClientReferralCaptureWrapper'), {
  ssr: false,
})

export default function ClientReferralCaptureWrapper() {
  return (
    <Suspense fallback={null}>
      <ClientReferralCapture />
    </Suspense>
  )
}
