'use client';

import Link from 'next/link';

export default function StickyHeader() {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="shrink-0 inline-flex items-center gap-2">
          {/* Logo mark (simple) */}
          <span className="inline-block w-6 h-6 rounded-lg bg-black" aria-hidden />
          <span className="font-semibold">OmniNet</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href="/explore"
            className="px-3 py-2 rounded-xl border hover:bg-gray-50 text-sm"
          >
            Explore
          </Link>
          <Link
            href="/new"
            className="px-3 py-2 rounded-xl border hover:bg-gray-50 text-sm"
          >
            Create
          </Link>
          <Link
            href="/my"
            className="px-3 py-2 rounded-xl border hover:bg-gray-50 text-sm"
          >
            My
          </Link>
        </nav>
      </div>
    </header>
  );
}
