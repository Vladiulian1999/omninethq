'use client'

import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-4xl font-bold mb-4">😕 Page Not Found</h1>
      <p className="text-gray-600 mb-6">
        We couldn't find what you're looking for.
      </p>
      <Link
        href="/explore"
        className="bg-black text-white px-5 py-2 rounded hover:bg-gray-800 transition"
      >
        🔎 Explore Tags
      </Link>
    </div>
  )
}
