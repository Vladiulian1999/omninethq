import './globals.css'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import ClientReferralCaptureWrapper from '@/components/ClientReferralCaptureWrapper'

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
        {children}
        <Toaster />
        {/* ✅ Safe client-only code, wrapped properly */}
        <ClientReferralCaptureWrapper />
      </body>
    </html>
  )
}
