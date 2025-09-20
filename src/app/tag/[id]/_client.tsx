'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import toast from 'react-hot-toast'
import OwnerBookingToggle from '@/components/OwnerBookingToggle'
import BookingRequestForm from '@/components/BookingRequestForm'
import ShareButton from '@/components/ShareButton'
import { BackButton } from '@/components/BackButton'
import { Skeleton } from '@/components/Skeleton'

type TagRow = {
  id: string
  user_id: string
  title: string
  description: string | null
  category: string | null
  views: number | null
  featured: boolean | null
  bookings_enabled: boolean | null
  created_at?: string | null
}

export default function TagClient({ tagId }: { tagId: string }) {
  const [tag, setTag] = useState<TagRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [me, setMe] = useState<string | null>(null)

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://omninethq.co.uk'

  // who am I?
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null))
  }, [])

  // load the tag (must include user_id + bookings_enabled)
  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      setErr(null)
      const { data, error } = await supabase
        .from('messages')
        .select(
          'id, user_id, title, description, category, views, featured, bookings_enabled, created_at'
        )
        .eq('id', tagId)
        .maybeSingle()

      if (!active) return
      if (error) {
        console.error(error)
        setErr('Could not load tag')
        setTag(null)
      } else if (!data) {
        setErr('Tag not found')
        setTag(null)
      } else {
        setTag(data as TagRow)
      }
      setLoading(false)
    })()

    return () => {
      active = false
    }
  }, [tagId])

  const shareUrl = useMemo(() => `${origin}/tag/${tagId}`, [origin, tagId])

  // DEBUG helper for owners: force enable if somehow toggle didn’t show
  async function debugForceEnable() {
    if (!tag) return
    if (!me || me !== tag.user_id) {
      toast.error('Only the owner can change this setting')
      return
    }
    const { error } = await supabase
      .from('messages')
      .update({ bookings_enabled: true })
      .eq('id', tag.id)
    if (error) {
      console.error(error)
      toast.error('Failed to enable bookings')
    } else {
      toast.success('Bookings enabled (debug)')
      setTag({ ...tag, bookings_enabled: true })
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <div className="mb-3">
          <BackButton />
        </div>
        <div className="border rounded-2xl p-4 bg-white">
          <Skeleton className="h-6 w-1/2 mb-3" />
          <Skeleton className="h-4 w-5/6 mb-2" />
          <Skeleton className="h-4 w-4/6 mb-6" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
      </div>
    )
  }

  if (err || !tag) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-3">
        <BackButton />
        <div className="p-4 border rounded-2xl bg-white">
          <p className="text-sm text-red-600">{err ?? 'Tag not found'}</p>
          <p className="mt-2 text-sm">
            Go back to{' '}
            <Link href="/explore" className="text-blue-600 underline">
              Explore
            </Link>
            .
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      {/* top actions */}
      <div className="flex items-center justify-between gap-3">
        <BackButton />
        <ShareButton
          url={shareUrl}
          title={`Check out "${tag.title}" on OmniNet`}
          className="px-3 py-2 rounded-xl border hover:bg-gray-50 text-sm"
        >
          📣 Share
        </ShareButton>
      </div>

      {/* header + owner toggle */}
      <div className="border rounded-2xl p-4 bg-white space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">{tag.title}</h1>
          <OwnerBookingToggle
            tagId={tag.id}
            tagOwnerId={tag.user_id}
            initialEnabled={!!tag.bookings_enabled}
          />
        </div>

        {tag.description ? (
          <p className="text-sm text-gray-700">{tag.description}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          {tag.category ? (
            <span className="px-2 py-1 rounded-full bg-gray-100">{tag.category}</span>
          ) : null}
          {typeof tag.views === 'number' ? <span>👁 {tag.views}</span> : null}
          {tag.featured ? (
            <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">Featured</span>
          ) : null}
          <span className="text-gray-400">ID: {tag.id}</span>
        </div>
      </div>

      {/* tiny debug panel (temporary) */}
      <div className="p-3 border rounded-xl bg-white/70 text-xs text-gray-600">
        <div>DEBUG — me: <code>{me ?? 'anon'}</code></div>
        <div>owner: <code>{tag.user_id}</code></div>
        <div>bookings_enabled: <code>{String(!!tag.bookings_enabled)}</code></div>
        {me && me === tag.user_id && !tag.bookings_enabled ? (
          <button
            onClick={debugForceEnable}
            className="mt-2 px-2 py-1 rounded border"
          >
            Force enable (owner)
          </button>
        ) : null}
      </div>

      {/* booking section */}
      <section className="mt-2">
        <h2 className="text-lg font-semibold mb-2">Booking</h2>
        <BookingRequestForm tagId={tag.id} enabled={!!tag.bookings_enabled} />
      </section>
    </div>
  )
}
