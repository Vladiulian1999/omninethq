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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

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

  const baseH = 56

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
    const active = href ? pathname === href || pathname.startsWith(href + '/') : false
    const cls =
      'flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-100 hover:bg-white/10'

    if (href) {
      return (
        <Link
          href={href}
          className={`${cls} ${active ? 'bg-white/15 text-white hover:bg-white/15' : ''}`}
          onClick={() => setOpen(false)}
        >
          {children}
          {active ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-cyan-200" /> : null}
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
      className={
        'sticky top-0 z-40 border-b border-white/10 bg-[#05070d]/88 text-white shadow-[0_16px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl'
      }
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        ['--header-h' as any]: `calc(${baseH}px + env(safe-area-inset-top))`,
      }}
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-xl border border-white/10 bg-white/10 p-1 shadow-[0_0_24px_rgba(45,212,191,0.14)]">
            <img src="/icon-omninet.svg" alt="OmniNet" className="w-6 h-6 rounded-lg shrink-0" />
          </span>
          <a href="/" className="font-semibold truncate text-white">
            OmniNet
          </a>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={
              'px-3 py-1.5 rounded-xl border border-white/15 bg-white/[0.07] text-sm text-white shadow-[0_0_24px_rgba(45,212,191,0.10)] backdrop-blur transition hover:bg-white/[0.12]'
            }
          >
            Menu
          </button>

          {open && (
            <div
              role="menu"
              className={
                'absolute right-0 mt-2 w-56 rounded-2xl border border-white/10 bg-[#08101b]/95 shadow-2xl p-2 backdrop-blur-xl'
              }
            >
              <Item href="/explore">Explore</Item>
              <Item href="/new">Create</Item>
              <Item href="/my">My</Item>

              <div className="my-2 h-px bg-white/10" />

              {signedIn ? (
                <>
                  <Item href="/profile">Profile</Item>
                  <Item onClick={logout}>Logout</Item>
                </>
              ) : (
                <Item href="/login">Login</Item>
              )}

              <div className="my-2 h-px bg-white/10" />

              <Item href="/success">Recent Donations</Item>
              <Item href="/leaderboard">Referral Leaderboard</Item>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
