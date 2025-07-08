'use client'

import { useRouter } from 'next/navigation'

export function BackButton() {
  const router = useRouter()

  return (
    <button
      onClick={() => router.back()}
      className="text-sm text-gray-600 hover:text-black px-3 py-1 border border-gray-300 rounded-md inline-flex items-center mb-4"
    >
      ← Back
    </button>
  )
}
