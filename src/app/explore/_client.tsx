'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ShareButton from '@/components/ShareButton'
import { Skeleton } from '@/components/Skeleton'
import { BackButton } from '@/components/BackButton'

type Tag = {
  id: string
  title: string
  description: string | null
  category: string | null
  views: number | null
  featured: boolean | null
  hidden?: boolean | null
  created_at?: string | null
  average_rating?: number
}

type FeedbackRow = {
  tag_id: string
  rating: number
  hidden?: boolean | null
}

const CATEGORIES = ['all', 'rent', 'sell', 'teach', 'help'] as const
type SortKey = 'popular' | 'new' | 'featured'

function CategoryPill({ category }: { category: string | null }) {
  const base = 'px-2 py-1 rounded-full text-xs'
  switch ((category || '').toLowerCase()) {
    case 'rent':
      return <span className={`${base} bg-blue-100 text-blue-800`}>rent</span>
    case 'sell':
      return <span className={`${base} bg-green-100 text-green-800`}>sell</span>
    case 'teach':
      return <span className={`${base} bg-yellow-100 text-yellow-800`}>teach</span>
    case 'help':
      return <span className={`${base} bg-purple-100 text-purple-800`}>help</span>
    default:
      return <span className={`${base} bg-gray-100 text-gray-700`}>{category || 'other'}</span>
  }
}

function isTagArray(x: unknown): x is Tag[] {
  return Array.isArray(x)
}
function isFeedbackArray(x: unknown): x is FeedbackRow[] {
  return Array.isArray(x)
}

export default function ExploreClient() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Tag[]>([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('all')
  const [sort, setSort] = useState<SortKey>('popular')

  useEffect(() => {
    ;(async () => {
      setLoading(true)

      const { data: tagsData, error: tagsErr } = await supabase
        .from('messages')
        .select('id, title, description, category, views, featured, hidden, created_at')
        .eq('hidden', false)
        .limit(200)

      if (tagsErr) {
        console.error('Error fetching tags:', tagsErr)
        setRows([])
        setLoading(false)
        return
      }

      const tagsList: Tag[] = isTagArray(tagsData)
        ? tagsData
        : (tagsData ?? []) as unknown as Tag[]

      const ids = tagsList.map((t) => t.id)

      let ratingMap: Record<string, { sum: number; count: number }> = {}
      if (ids.length) {
        const { data: feedback, error: fbErr } = await supabase
          .from('feedback')
          .select('tag_id, rating, hidden')
          .in('tag_id', ids)
          .eq('hidden', false)

        if (fbErr) {
          console.error('Error fetching feedback:', fbErr)
        } else {
          const fbRows: FeedbackRow[] = isFeedbackArray(feedback)
            ? feedback
            : (feedback ?? []) as unknown as FeedbackRow[]

          for (const f of fbRows) {
            if (!ratingMap[f.tag_id]) ratingMap[f.tag_id] = { sum: 0, count: 0 }
            ratingMap[f.tag_id].sum += Number(f.rating) || 0
            ratingMap[f.tag_id].count += 1
          }
        }
      }

      const enriched: Tag[] = tagsList.map((t) => {
        const r = ratingMap[t.id]
        const avg = r && r.count > 0 ? r.sum / r.count : undefined
        return { ...t, average_rating: avg }
      })

      setRows(enriched)
      setLoading(false)
    })()
  }, [])

  const filtered = useMemo<Tag[]>(() => {
    let out: Tag[] = rows

    if (cat !== 'all') {
      const c = cat.toLowerCase()
      out = out.filter((r) => (r.category || '').toLowerCase() === c)
    }

    if (q.trim()) {
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
      out = out.filter((r) =>
        terms.some(
          (t) =>
            (r.title || '').toLowerCase().includes(t) ||
            (r.description || '').toLowerCase().includes(t) ||
            r.id.toLowerCase().includes(t)
        )
      )
    }

    switch (sort) {
      case 'featured':
        out = out.slice().sort((a, b) => Number(b.featured) - Number(a.featured))
        break
      case 'new':
        out = out.slice().sort((a, b) => {
          const at = a.created_at ? new Date(a.created_at).getTime() : 0
          const bt = b.created_at ? new Date(b.created_at).getTime() : 0
          if (at !== bt) return bt - at
          return b.id.localeCompare(a.id)
        })
        break
      case 'popular':
      default:
        out = out.slice().sort((a, b) => (b.views || 0) - (a.views || 0))
    }

    return out
  }, [rows, q, cat, sort])

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://omninethq.co.uk'

  return (
    <div className="max-w-5xl mx-auto">
      <div className="px-4 pt-4">
        <BackButton />
      </div>

      {/* Sticky filter bar positioned right under the header (safe-area aware) */}
      <div
        className="sticky z-30 bg-white/90 backdrop-blur border-b"
        style={{ top: 'var(--header-h)' }}
      >
        <div className="px-4 py-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <input
            className="min-w-[180px] flex-1 border rounded-xl px-3 py-2 text-sm"
            placeholder="Search services…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`px-3 py-2 rounded-xl border text-sm ${
                  cat === c ? 'bg-black text-white' : 'hover:bg-gray-50'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <select
            className="border rounded-xl px-3 py-2 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="popular">Most scanned</option>
            <option value="featured">Featured</option>
            <option value="new">New</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="border rounded-2xl p-4 bg-white">
                <Skeleton className="h-5 w-2/3 mb-2" />
                <Skeleton className="h-4 w-5/6 mb-2" />
                <Skeleton className="h-4 w-3/4 mb-4" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </div>
            ))
          : filtered.length === 0 ? (
              <div className="col-span-full text-center text-gray-500">
                <p>No matching tags found.</p>
                <p className="mt-2">
                  Want to create one?{' '}
                  <Link href="/new" className="text-blue-600 hover:underline">
                    Click here
                  </Link>
                </p>
              </div>
            ) : (
              filtered.map((t) => (
                <article key={t.id} className="border rounded-2xl p-4 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-lg">{t.title}</h3>
                    {t.featured ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
                        Featured
                      </span>
                    ) : null}
                  </div>

                  {t.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-3">
                      {t.description}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                    <CategoryPill category={t.category} />
                    {typeof t.views === 'number' && <span>👁 {t.views}</span>}
                    {typeof t.average_rating === 'number' && (
                      <span>⭐ {t.average_rating.toFixed(1)}</span>
                    )}
                    <span className="text-gray-400">ID: {t.id}</span>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Link
                      href={`/tag/${t.id}`}
                      className="px-3 py-2 rounded-xl border hover:bg-gray-50 text-sm"
                    >
                      Open
                    </Link>
                    <ShareButton
                      url={`${origin}/tag/${t.id}`}
                      title={`Check out "${t.title}" on OmniNet`}
                      className="px-3 py-2 rounded-xl border hover:bg-gray-50 text-sm"
                    >
                      📣 Share
                    </ShareButton>
                  </div>
                </article>
              ))
            )}
      </div>
    </div>
  )
}
