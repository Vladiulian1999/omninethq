'use client'

import './globals.css'
import Link from 'next/link'
import { ReactNode, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import HeaderControls from '@/components/HeaderControls'

export const metadata = {
  title: 'OmniNet',
  description: 'Decentralized human services. Book anything by QR.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Capture and store referral code on route change
  useEffect(() => {
    const ref = searchParams.get('ref')
    if (ref) {
      localStorage.setItem('referral_code', ref)
    }
  }, [pathname, searchParams])

  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-black">
        <header className="p-4 border-b bg-white shadow-sm flex justify-between items-center">
          <Link href="/" className="font-bold text-xl">
            🧩 OmniNet
          </Link>
          <div className="flex gap-4 items-center">
            <HeaderControls />
          </div>
        </header>
        <main className="p-4">
          <div className="max-w-4xl mx-auto w-full">{children}</div>
        </main>
      </body>
    </html>
  )
}
