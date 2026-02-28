'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ShareButton from '@/components/ShareButton'
import { Skeleton } from '@/components/Skeleton'
import { BackButton } from '@/components/BackButton'
import { logEvent } from '@/lib/analytics'

type MixRow = {
  block_id: string
  tag_id: string
  bucket: 'exploit' | 'explore'
  final_rank_score: string | number | null
}

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

type Card = {
  tag: Tag
  block_id: string
  bucket: 'exploit' | 'explore'
  final_rank_score: number | null
  position: number
}

const CATEGORIES = ['all', 'rent', 'sell', 'teach', 'help'] as const
type SortKey = 'reinforced' | 'new' | 'featured' | 'popular'

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

function isArray<T>(x: unknown): x is T[] {
  return Array.isArray(x)
}

function toNum(x: string | number | null | undefined): number | null {
  if (x === null || x === undefined) return null
  const n = typeof x === 'string' ? Number(x) : x
  return Number.isFinite(n) ? n : null
}

function oncePerSession(key: string): boolean {
  try {
    if (typeof window === 'undefined') return true
    if (sessionStorage.getItem(key)) return false
    sessionStorage.setItem(key, '1')
    return true
  } catch {
    return true // if storage fails, don't block logging
  }
}

export default function ExploreClient() {
  const [loading, setLoading] = useState(true)

  // Store cards (ranked units), not just tags
  const [cards, setCards] = useState<Card[]>([])

  // UI filters
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('all')
  const [sort, setSort] = useState<SortKey>('reinforced')

  const logExplore = useCallback(
    async (
      event: string,
      c: Card,
      extraMeta?: Record<string, unknown>
    ) => {
      if (!c?.block_id || !c?.tag?.id) return
      const key = `explore_${event}_${c.block_id}`
      if (!oncePerSession(key)) return

      await logEvent(event as any, {
        tag_id: c.tag.id,
        meta: {
          block_id: c.block_id,
          bucket: c.bucket,
          position: c.position,
          final_rank_score: c.final_rank_score,
          source: 'explore',
          ...(extraMeta || {}),
        },
      }).catch(() => {})
    },
    []
  )

  useEffect(() => {
    ;(async () => {
      setLoading(true)

      // 1) Fetch ranked blocks (mix: exploit + explore)
      const { data: mixData, error: mixErr } = await supabase.rpc('get_ranked_blocks_mix_v1', {
        p_limit: 60,
      })

      if (mixErr) {
        console.error('Error fetching ranked mix:', mixErr)
        setCards([])
        setLoading(false)
        return
      }

      const mixList: MixRow[] = isArray<MixRow>(mixData) ? mixData : ((mixData ?? []) as MixRow[])
      const tagIds = Array.from(new Set(mixList.map((r) => r.tag_id).filter(Boolean)))
      if (!tagIds.length) {
        setCards([])
        setLoading(false)
        return
      }

      // 2) Fetch tag display fields
      const { data: tagsData, error: tagsErr } = await supabase
        .from('messages')
        .select('id, title, description, category, views, featured, hidden, created_at')
        .in('id', tagIds)
        .eq('hidden', false)

      if (tagsErr) {
        console.error('Error fetching tags:', tagsErr)
        setCards([])
        setLoading(false)
        return
      }

      const tagsList: Tag[] = isArray<Tag>(tagsData) ? tagsData : ((tagsData ?? []) as Tag[])
      const tagMap = new Map(tagsList.map((t) => [t.id, t]))

      // 3) Feedback aggregation (optional)
      let ratingMap: Record<string, { sum: number; count: number }> = {}
      const { data: feedback, error: fbErr } = await supabase
        .from('feedback')
        .select('tag_id, rating, hidden')
        .in('tag_id', tagIds)
        .eq('hidden', false)

      if (fbErr) {
        console.error('Error fetching feedback:', fbErr)
      } else {
        const fbRows: FeedbackRow[] = isArray<FeedbackRow>(feedback) ? feedback : ((feedback ?? []) as FeedbackRow[])
        for (const f of fbRows) {
          if (!ratingMap[f.tag_id]) ratingMap[f.tag_id] = { sum: 0, count: 0 }
          ratingMap[f.tag_id].sum += Number(f.rating) || 0
          ratingMap[f.tag_id].count += 1
        }
      }

      // 4) Build ranked cards in the exact mix order
      const built: Card[] = []
      for (let i = 0; i < mixList.length; i++) {
        const r = mixList[i]
        const t0 = tagMap.get(r.tag_id)
        if (!t0) continue

        const rr = ratingMap[t0.id]
        const avg = rr && rr.count > 0 ? rr.sum / rr.count : undefined
        const tag: Tag = { ...t0, average_rating: avg }

        built.push({
          tag,
          block_id: r.block_id,
          bucket: r.bucket,
          final_rank_score: toNum(r.final_rank_score),
          position: i + 1,
        })
      }

      setCards(built)
      setLoading(false)

      // ---- Explore exposure logging (server-truth) ----
      // Log top 12 impressions in parallel; once per session per block_id
      try {
        const top = built.slice(0, 12)
        await Promise.all(
          top.map((c) =>
            logExplore('explore_impression', c).catch(() => {})
          )
        )
      } catch {}
    })()
  }, [logExplore])

  const filtered = useMemo<Card[]>(() => {
    let out: Card[] = cards

    if (cat !== 'all') {
      const c = cat.toLowerCase()
      out = out.filter((x) => (x.tag.category || '').toLowerCase() === c)
    }

    if (q.trim()) {
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
      out = out.filter((x) =>
        terms.some(
          (t) =>
            (x.tag.title || '').toLowerCase().includes(t) ||
            (x.tag.description || '').toLowerCase().includes(t) ||
            x.tag.id.toLowerCase().includes(t)
        )
      )
    }

    switch (sort) {
      case 'featured':
        out = out.slice().sort((a, b) => Number(b.tag.featured) - Number(a.tag.featured))
        break
      case 'new':
        out = out.slice().sort((a, b) => {
          const at = a.tag.created_at ? new Date(a.tag.created_at).getTime() : 0
          const bt = b.tag.created_at ? new Date(b.tag.created_at).getTime() : 0
          if (at !== bt) return bt - at
          return b.tag.id.localeCompare(a.tag.id)
        })
        break
      case 'popular':
        out = out.slice().sort((a, b) => (b.tag.views || 0) - (a.tag.views || 0))
        break
      case 'reinforced':
      default:
        // Keep reinforcement order (already sorted)
        break
    }

    return out
  }, [cards, q, cat, sort])

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://omninethq.co.uk'

  return (
    <div className="max-w-5xl mx-auto">
      <div className="px-4 pt-4">
        <BackButton />
      </div>

      <div className="sticky z-30 bg-white/90 backdrop-blur border-b" style={{ top: 'var(--header-h)' }}>
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
                className={`px-3 py-2 rounded-xl border text-sm ${cat === c ? 'bg-black text-white' : 'hover:bg-gray-50'}`}
              >
                {c}
              </button>
            ))}
          </div>

          <select className="border rounded-xl px-3 py-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="reinforced">Reinforced (A/B mix)</option>
            <option value="popular">Most scanned (legacy)</option>
            <option value="featured">Featured</option>
            <option value="new">New</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
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
        ) : filtered.length === 0 ? (
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
          filtered.map((c) => {
            const t = c.tag
            const badge =
              c.bucket === 'explore' ? (
                <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800">Explore</span>
              ) : (
                <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">Top</span>
              )

            return (
              <article key={`${c.block_id}_${t.id}`} className="border rounded-2xl p-4 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{t.title}</h3>
                    {badge}
                  </div>

                  {t.featured ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">Featured</span>
                  ) : null}
                </div>

                {t.description && <p className="text-sm text-gray-600 mt-1 line-clamp-3">{t.description}</p>}

                <div className="mt-3 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                  <CategoryPill category={t.category} />
                  {typeof t.views === 'number' && <span>👁 {t.views}</span>}
                  {typeof t.average_rating === 'number' && <span>⭐ {t.average_rating.toFixed(1)}</span>}
                  <span className="text-gray-400">ID: {t.id}</span>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Link
                    href={`/tag/${t.id}`}
                    onClick={() => {
                      // Log open click once per session per block
                      logExplore('explore_open_click', c).catch(() => {})
                    }}
                    className="px-3 py-2 rounded-xl border hover:bg-gray-50 text-sm"
                  >
                    Open
                  </Link>

                  <ShareButton
  url={`${origin}/tag/${t.id}`}
  title={`Check out "${t.title}" on OmniNet`}
  className="px-3 py-2 rounded-xl border hover:bg-gray-50 text-sm"
  onClick={() => {
    // attempt (user clicked share button)
    logExplore('explore_share_click', c).catch(() => {})
  }}
  onShared={(method) => {
    // success (user actually shared or copied)
    if (method === 'share') {
      logExplore('explore_share_success', c).catch(() => {})
    } else {
      logExplore('explore_copy_success', c).catch(() => {})
    }
  }}
>
  📣 Share
</ShareButton>
                </div>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}