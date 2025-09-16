import './globals.css'
import { Inter } from 'next/font/google'
import StickyHeader from '@/components/StickyHeader'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'OmniNet',
  description: 'Real-world API for people',
  manifest: '/manifest.webmanifest',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* SVG favicon for modern browsers */}
        <link rel="icon" href="/icon-omninet.svg" type="image/svg+xml" />

        {/* iOS home screen icon (180x180) */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />

        {/* Theme colors for light/dark */}
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0b0b0c" media="(prefers-color-scheme: dark)" />

        {/* iOS PWA hints */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className={inter.className}>
        <StickyHeader />
        {children}
      </body>
    </html>
  )
}
