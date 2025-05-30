// src/app/layout.tsx
import './globals.css'
import Link from 'next/link'
import { ReactNode } from 'react'

export const metadata = {
  title: 'OmniNet',
  description: 'Decentralized human services. Book anything by QR.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-black">
        <header className="p-4 border-b bg-white shadow-sm flex justify-between items-center">
          <Link href="/" className="font-bold text-xl">
            🧩 OmniNet
          </Link>
          <div className="flex gap-4 items-center">
            <Link
              href="/login"
              className="text-sm bg-black text-white px-3 py-1 rounded hover:bg-gray-800"
            >
              Login
            </Link>
          </div>
        </header>
        <main className="p-4">{children}</main>
      </body>
    </html>
  )
}
