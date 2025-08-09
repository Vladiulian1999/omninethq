import './globals.css'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import { Suspense } from 'react'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'OmniNet',
  description: 'Real-world API for people',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* ✅ Global Suspense around pages is fine to keep, but not required for the script */}
        <Suspense fallback={null}>{children}</Suspense>

        {/* ✅ Minimal, rock-solid referral capture (no hooks, no Suspense, no dynamic) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var sp = new URLSearchParams(window.location.search);
                var ref = sp.get('ref');
                if (ref) localStorage.setItem('referral_code', ref);
              } catch (e) {}
            `,
          }}
        />

        <Toaster />
      </body>
    </html>
  )
}
