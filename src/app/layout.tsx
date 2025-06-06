import './globals.css'
import Link from 'next/link'
import { ReactNode } from 'react'
import HeaderControls from '@/components/HeaderControls'

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
