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
      start_at: now.toISOString(),
      end_at: sevenDaysLater.toISOString(),
      status: 'live',
      capacity: 1,
      price: 0,
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
      // Roll back the tag so we do not leave dead inventory behind.
      await supabase.from('messages').delete().eq('id', cleanedId)

      setError(
        `Tag was not fully created because the live block could not be created: ${blockError.message}`
      )
      setLoading(false)
      return
    }

    router.push(`/tag/${cleanedId}`)
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <BackButton />

      <h1 className="text-3xl font-bold mb-6 text-center">
        Create a New OmniTag
      </h1>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 bg-white p-4 rounded shadow"
      >
        <div className="flex gap-2">
          <input
            className="w-full border p-2 rounded"
            placeholder="Unique ID"
            value={id}
            onChange={(e) => setId(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setId(generateId())}
            className="px-3 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300"
          >
            ♻️
          </button>
        </div>

        <input
          className="w-full border p-2 rounded"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <textarea
          className="w-full border p-2 rounded"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full border p-2 rounded"
        >
          <option value="rent">🪜 Rent</option>
          <option value="help">🤝 Help</option>
          <option value="sell">🛒 Sell</option>
          <option value="teach">🎓 Teach</option>
        </select>

        <button
          type="submit"
          disabled={loading}
          className="bg-black text-white w-full px-4 py-2 rounded hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating...' : 'Create Tag'}
        </button>

        {error && <p className="text-red-500 text-center">{error}</p>}
      </form>
    </div>
  )
}