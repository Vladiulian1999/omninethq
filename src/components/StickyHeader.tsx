'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import NavAuth from './NavAuth'

const Tab = ({ href, children }: { href: string; children: React.ReactNode }) => {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(href + '/')
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-xl border ${active ? 'bg-black text-white' : 'bg-white'}`}
    >
      {children}
    </Link>
  )
}

export default function StickyHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/icon-omninet.svg" alt="OmniNet" className="w-6 h-6 rounded-lg" />
          <a href="/" className="font-semibold">OmniNet</a>
        </div>
        <nav className="flex items-center gap-2">
          <Tab href="/explore">Explore</Tab>
          <Tab href="/new">Create</Tab>
          <Tab href="/my">My</Tab>
        </nav>
        <NavAuth />
      </div>
    </header>
  )
}
