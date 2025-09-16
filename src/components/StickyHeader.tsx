'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function StickyHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Auth state (inline so we can show Login/Profile/Logout inside the menu)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Close on outside click / ESC
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [])

  const baseH = 56 // base row height (without safe-area)

  async function logout() {
    await supabase.auth.signOut()
    setOpen(false)
    router.push('/')
  }

  const Item = ({
    href,
    children,
    onClick,
  }: {
    href?: string
    children: React.ReactNode
    onClick?: () => void
  }) => {
    const active = href ? (pathname === href || pathname.startsWith(href + '/')) : false
    const cls =
      'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm hover:bg-gray-50'
    if (href) {
      return (
        <Link href={href} className={`${cls} ${active ? 'bg-black text-white hover:bg-black' : ''}`} onClick={() => setOpen(false)}>
          {children}
          {active ? <span aria-hidden>●</span> : null}
        </Link>
      )
    }
    return (
      <button className={cls} onClick={onClick}>
        {children}
      </button>
    )
  }

  return (
    <header
      className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        // expose header height (safe-area aware) for downstream sticky elements
        // @ts-ignore custom property
        ['--header-h' as any]: `calc(${baseH}px + env(safe-area-inset-top))`,
      }}
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-3">
          <img src="/icon-omninet.svg" alt="OmniNet" className="w-6 h-6 rounded-lg shrink-0" />
          <a href="/" className="font-semibold truncate">OmniNet</a>
        </div>

        {/* Single Menu button */}
        <div className="relative" ref={menuRef}>
          <button
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="px-3 py-1.5 rounded-xl border bg-white hover:bg-gray-50"
          >
            Menu
          </button>

          {open && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 rounded-2xl border bg-white shadow-lg p-2"
            >
              {/* Primary routes */}
              <Item href="/explore">Explore</Item>
              <Item href="/new">Create</Item>
              <Item href="/my">My</Item>

              <div className="my-2 h-px bg-gray-100" />

              {/* Auth-aware actions */}
              {signedIn ? (
                <>
                  <Item href="/profile">Profile</Item>
                  <Item onClick={logout}>Logout</Item>
                </>
              ) : (
                <Item href="/login">Login</Item>
              )}

              <div className="my-2 h-px bg-gray-100" />

              {/* Helpful links (optional) */}
              <Item href="/success">Recent Donations</Item>
              <Item href="/leaderboard">Referral Leaderboard</Item>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
