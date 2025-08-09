import './globals.css'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import NavAuth from '@/components/NavAuth'

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
        {/* simple top bar with Login/My/Logout */}
        <header className="w-full border-b bg-white">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="font-semibold">OmniNet</a>
            <NavAuth />
          </div>
        </header>

        {/* page content */}
        {children}

        {/* referral capture script (keep) */}
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
