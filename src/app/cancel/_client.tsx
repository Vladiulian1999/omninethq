'use client'

import { useSearchParams } from 'next/navigation'

export default function CancelClient() {
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason')

  return (
    <div className="text-center p-10">
      <h1 className="text-3xl font-bold text-red-600 mb-4">❌ Payment Cancelled</h1>
      <p className="text-gray-700">
        Your action was cancelled{reason ? `: ${reason}` : '.'}
      </p>
    </div>
  )
}
