'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ShareButton from '@/components/ShareButton'
import { Skeleton } from '@/components/Skeleton'
import { BackButton } from '@/components/BackButton'
import { logEvent, type EventName } from '@/lib/analytics'

type MixRow = {
  block_id: string
  tag_id: string
  bucket: 'exploit' | 'explore'
  boost_state: 'boost' | 'neutral' | 'throttle'
  final_rank_score: string | number | null
}

type Tag = {
  id: string
  title: string
  description: string | null
  category: string | null
  featured: boolean | null
  hidden?: boolean | null
  created_at?: string | null
  average_rating?: number
  views?: number
}

type FeedbackRow = {
  tag_id: string
  rating: number
  hidden?: boolean | null
}

type AnalyticsViewRow = {
  tag_id: string
}

type Card = {
  tag: Tag
  block_id: string
  bucket: 'exploit' | 'explore'
  boost_state: 'boost' | 'neutral' | 'throttle'
  final_rank_score: number | null
  position: number
}

const CATEGORIES = ['all', 'rent', 'sell', 'teach', 'help'] as const
type SortKey = 'reinforced' | 'new' | 'featured' | 'popular'

function CategoryPill({ category }: { category: string | null }) {
  const base = 'px-2 py-1 rounded-full text-xs border'
  switch ((category || '').toLowerCase()) {
    case 'rent':
      return <span className={`${base} border-blue-300/20 bg-blue-300/10 text-blue-100`}>rent</span>
    case 'sell':
      return <span className={`${base} border-emerald-300/20 bg-emerald-300/10 text-emerald-100`}>sell</span>
    case 'teach':
      return <span className={`${base} border-yellow-300/20 bg-yellow-300/10 text-yellow-100`}>teach</span>
    case 'help':
      return <span className={`${base} border-purple-300/20 bg-purple-300/10 text-purple-100`}>help</span>
    default:
      return <span className={`${base} border-slate-300/20 bg-slate-300/10 text-slate-200`}>{category || 'other'}</span>
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
    return true
  }
}

export default function ExploreClient() {
  const [loading, setLoading] = useState(true)
  const [cards, setCards] = useState<Card[]>([])

  const [q, setQ] = useState('')
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('all')
  const [sort, setSort] = useState<SortKey>('reinforced')

  const logExplore = useCallback(
    async (
      event: EventName,
      c: Card,
      extraMeta?: Record<string, unknown>
    ) => {
      if (!c?.block_id || !c?.tag?.id) return
      const key = `explore_${event}_${c.block_id}`
      if (!oncePerSession(key)) return

      await logEvent(event, {
        tag_id: c.tag.id,
        meta: {
          block_id: c.block_id,
          bucket: c.bucket,
          boost_state: c.boost_state,
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

      const { data: mixData, error: mixErr } = await supabase.rpc('get_ranked_blocks_mix_v2', {
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

      const { data: tagsData, error: tagsErr } = await supabase
        .from('messages')
        .select('id, title, description, category, featured, hidden, created_at')
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

      const viewMap: Record<string, number> = {}
      const { data: viewRows, error: viewErr } = await supabase
        .from('analytics_events')
        .select('tag_id')
        .eq('event', 'view_tag')
        .in('tag_id', tagIds)

      if (viewErr) {
        console.error('Error fetching view counts:', viewErr)
      } else {
        const rows: AnalyticsViewRow[] = isArray<AnalyticsViewRow>(viewRows)
          ? viewRows
          : ((viewRows ?? []) as AnalyticsViewRow[])

        for (const row of rows) {
          if (!row.tag_id) continue
          viewMap[row.tag_id] = (viewMap[row.tag_id] || 0) + 1
        }
      }

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

      const built: Card[] = []
      for (let i = 0; i < mixList.length; i++) {
        const r = mixList[i]
        const t0 = tagMap.get(r.tag_id)
        if (!t0) continue

        const rr = ratingMap[t0.id]
        const avg = rr && rr.count > 0 ? rr.sum / rr.count : undefined
        const realViews = viewMap[t0.id] || 0

        const tag: Tag = {
          ...t0,
          average_rating: avg,
          views: realViews,
        }

        built.push({
          tag,
          block_id: r.block_id,
          bucket: r.bucket,
          boost_state: r.boost_state ?? 'neutral',
          final_rank_score: toNum(r.final_rank_score),
          position: i + 1,
        })
      }

      setCards(built)
      setLoading(false)

      try {
        const top = built.slice(0, 12)
        await Promise.all(
          top.map((c) => logExplore('explore_impression', c).catch(() => {}))
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
        break
    }

    return out
  }, [cards, q, cat, sort])

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://omninethq.co.uk'

  return (
    <div className="max-w-5xl mx-auto text-slate-100">
      <div className="px-4 pt-4">
        <BackButton className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white" />
      </div>

      <div className="sticky z-30 border-b border-white/10 bg-[#05070d]/82 backdrop-blur-xl" style={{ top: 'var(--header-h)' }}>
        <div className="px-4 py-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <input
            className="omni-input min-w-[180px] flex-1 rounded-xl px-3 py-2 text-sm outline-none focus:border-cyan-300/50"
            placeholder="Search services…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <div className="flex gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`rounded-xl border px-3 py-2 text-sm transition ${
                  cat === c
                    ? 'border-cyan-300/30 bg-cyan-300/15 text-cyan-100'
                    : 'border-white/10 bg-white/[0.045] text-slate-200 hover:bg-white/[0.09]'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <select
            className="omni-input rounded-xl px-3 py-2 text-sm outline-none focus:border-cyan-300/50"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="reinforced">Reinforced (Auto-Boost mix)</option>
            <option value="popular">Most viewed</option>
            <option value="featured">Featured</option>
            <option value="new">New</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="omni-card rounded-2xl p-4">
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
          <div className="omni-card col-span-full rounded-2xl p-6 text-center text-slate-300">
            <p>No matching tags found.</p>
            <p className="mt-2">
              Want to create one?{' '}
              <Link href="/new" className="text-cyan-200 hover:underline">
                Click here
              </Link>
            </p>
          </div>
        ) : (
          filtered.map((c) => {
            const t = c.tag

            const primaryBadge =
              c.bucket === 'explore' ? (
                <span className="text-xs px-2 py-1 rounded-full border border-purple-300/20 bg-purple-300/10 text-purple-100">Explore</span>
              ) : c.boost_state === 'boost' ? (
                <span className="text-xs px-2 py-1 rounded-full border border-emerald-300/20 bg-emerald-300/10 text-emerald-100">Boosted</span>
              ) : c.boost_state === 'throttle' ? (
                <span className="text-xs px-2 py-1 rounded-full border border-rose-300/20 bg-rose-300/10 text-rose-100">Throttled</span>
              ) : (
                <span className="text-xs px-2 py-1 rounded-full border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">Top</span>
              )

            return (
              <article key={`${c.block_id}_${t.id}`} className="omni-card rounded-2xl p-4 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/25">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-lg text-white">{t.title}</h3>
                    {primaryBadge}
                  </div>

                  {t.featured ? (
                    <span className="text-xs px-2 py-1 rounded-full border border-yellow-300/20 bg-yellow-300/10 text-yellow-100">Featured</span>
                  ) : null}
                </div>

                {t.description && <p className="text-sm text-slate-300 mt-1 line-clamp-3">{t.description}</p>}

                <div className="mt-3 flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                  <CategoryPill category={t.category} />
                  <span>👁 {t.views || 0}</span>
                  {typeof t.average_rating === 'number' && <span>⭐ {t.average_rating.toFixed(1)}</span>}
                  <span className="text-slate-500">ID: {t.id}</span>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Link
                    href={`/tag/${t.id}`}
                    onClick={() => {
                      logExplore('explore_open_click', c).catch(() => {})
                    }}
                    className="omni-button-primary rounded-xl px-3 py-2 text-sm font-medium transition hover:-translate-y-0.5"
                  >
                    Open
                  </Link>

                  <ShareButton
                    url={`${origin}/tag/${t.id}`}
                    title={`Check out "${t.title}" on OmniNet`}
                    className="omni-button-secondary rounded-xl px-3 py-2 text-sm transition hover:bg-white/[0.12]"
                    onClick={() => {
                      logExplore('explore_share_click', c).catch(() => {})
                    }}
                    onShared={(method) => {
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
