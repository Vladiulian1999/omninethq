'use client'

import { useSearchParams } from 'next/navigation'

export default function CancelClient() {
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason')

  return (
    <div className="omni-page-bg relative min-h-screen overflow-hidden p-10 text-center text-white">
      <div className="omni-grid-bg pointer-events-none absolute inset-0 opacity-20" />
      <div className="omni-panel relative z-10 mx-auto max-w-xl rounded-2xl p-6">
      <h1 className="mb-4 text-3xl font-bold text-red-200">❌ Payment Cancelled</h1>
      <p className="text-slate-300">
        Your action was cancelled{reason ? `: ${reason}` : '.'}
      </p>
      </div>
    </div>
  )
}
