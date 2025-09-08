// src/app/layout.tsx
import './globals.css'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import Link from 'next/link'
import NavAuth from '@/components/NavAuth'
import A2HSNudge from '@/components/A2HSNudge'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'OmniNet',
  description: 'Real-world API for people',
}

// Inline StickyHeader with NavAuth
function StickyHeader() {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="shrink-0 inline-flex items-center gap-2">
          {/* Logo mark (simple) */}
          <span className="inline-block w-6 h-6 rounded-lg bg-black" aria-hidden />
          <span className="font-semibold">OmniNet</span>
        </Link>

        <nav className="flex items-center gap-2">
          <Link href="/explore" className="px-3 py-2 rounded-xl border hover:bg-gray-50 text-sm">
            Explore
          </Link>
          <Link href="/new" className="px-3 py-2 rounded-xl border hover:bg-gray-50 text-sm">
            Create
          </Link>
          <Link href="/my" className="px-3 py-2 rounded-xl border hover:bg-gray-50 text-sm">
            My
          </Link>

          {/* Auth controls */}
          <NavAuth />
        </nav>
      </div>
    </header>
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        {/* global sticky header */}
        <StickyHeader />

        {/* Add-to-home-screen nudge */}
        <A2HSNudge />

        {/* page content */}
        {children}

        {/* referral capture script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var sp=new URLSearchParams(window.location.search);var ref=sp.get('ref');if(ref)localStorage.setItem('referral_code',ref);}catch(e){}})();`,
          }}
        />

        <Toaster />
      </body>
    </html>
  )
}

