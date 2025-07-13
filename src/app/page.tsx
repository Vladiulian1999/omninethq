'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center p-6">
      <h1 className="text-4xl sm:text-5xl font-bold mb-4">OmniNet</h1>
      <p className="text-gray-600 max-w-md mb-8">
        Connect anything in the real world to the internet with a simple QR code.
        Rent tools, offer help, sell skills, and more.
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href="/explore"
          className="bg-black text-white px-6 py-3 rounded hover:bg-gray-800 transition"
        >
          🔎 Explore Tags
        </Link>
        <Link
          href="/new"
          className="bg-white text-black border border-gray-300 px-6 py-3 rounded hover:bg-gray-100 transition"
        >
          ➕ Create a Tag
        </Link>
      </div>
    </main>
  )
}
