'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { BackButton } from '@/components/BackButton'

function generateId(prefix = 'tag') {
  const random = Math.random().toString(36).substring(2, 7)
  return `${prefix}-${random}`
}

function sanitizeTagId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function NewTagClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('rent')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let mounted = true

    const getUser = async () => {
      const { data, error } = await supabase.auth.getUser()

      if (!mounted) return

      if (error || !data?.user) {
        router.push('/login?next=/new')
        return
      }

      setUser(data.user)
    }

    getUser()

    setId(generateId())

    const t = searchParams.get('title')
    const d = searchParams.get('description')
    const c = searchParams.get('category')

    if (t) setTitle(t)
    if (d) setDescription(d)
    if (c) setCategory(c)

    return () => {
      mounted = false
    }
  }, [router, searchParams])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!user) {
      setError('You must be logged in to create a tag.')
      setLoading(false)
      return
    }

    const cleanedId = sanitizeTagId(id)

    if (!cleanedId) {
      setError('Please enter a valid tag ID.')
      setLoading(false)
      return
    }

    if (!title.trim()) {
      setError('Title is required.')
      setLoading(false)
      return
    }

    if (!description.trim()) {
      setError('Description is required.')
      setLoading(false)
      return
    }

    const now = new Date()
    const sevenDaysLater = new Date(now)
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7)

    const messagePayload = {
      id: cleanedId,
      title: title.trim(),
      description: description.trim(),
      category,
      user_id: user.id,
      featured: false,
      hidden: false,
    }

    const blockPayload = {
      tag_id: cleanedId,
      owner_id: user.id,
      title: title.trim(),
      description: description.trim(),
      start_at: now.toISOString(),
      end_at: sevenDaysLater.toISOString(),
      timezone: 'Europe/London',
      capacity_total: null,
      capacity_remaining: null,
      status: 'live',
      action_type: 'reserve',
      price_pence: null,
      currency: 'GBP',
      visibility: 'public',
      sort_rank: 0,
      meta: { autoStarter: true },
    }

    const { error: messageError } = await supabase
      .from('messages')
      .insert([messagePayload])

    if (messageError) {
      setError(messageError.message)
      setLoading(false)
      return
    }

    const { error: blockError } = await supabase
      .from('availability_blocks')
      .insert([blockPayload])

    if (blockError) {
      await supabase.from('messages').delete().eq('id', cleanedId)

      setError(
        `Tag was not fully created because the starter availability could not be created: ${blockError.message}`
      )
      setLoading(false)
      return
    }

    router.push(`/tag/${cleanedId}`)
  }

  return (
    <div className="omni-page-bg relative min-h-screen overflow-hidden px-4 py-8 text-white">
      <div className="omni-grid-bg pointer-events-none absolute inset-0 opacity-20" />
      <div className="relative z-10 mx-auto max-w-xl">
      <BackButton className="inline-flex items-center gap-2 text-sm text-slate-300 transition hover:text-white" />

      <h1 className="mb-6 mt-4 text-center text-3xl font-bold text-white">
        Create a New OmniTag
      </h1>

      <form
        onSubmit={handleSubmit}
        className="omni-panel space-y-4 rounded-2xl p-4"
      >
        <div className="flex gap-2">
          <input
            className="omni-input w-full rounded p-2"
            placeholder="Unique ID"
            value={id}
            onChange={(e) => setId(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setId(generateId())}
            className="omni-button-secondary rounded px-3 py-2 text-sm"
          >
            ♻️
          </button>
        </div>

        <input
          className="omni-input w-full rounded p-2"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <textarea
          className="omni-input w-full rounded p-2"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="omni-input w-full rounded p-2"
        >
          <option value="rent">🪜 Rent</option>
          <option value="help">🤝 Help</option>
          <option value="sell">🛒 Sell</option>
          <option value="teach">🎓 Teach</option>
        </select>

        <button
          type="submit"
          disabled={loading}
          className="omni-button-primary w-full rounded px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Creating...' : 'Create Tag'}
        </button>

        {error && <p className="text-center text-red-200">{error}</p>}
      </form>
      </div>
    </div>
  )
}
