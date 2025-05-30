'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { User } from '@supabase/supabase-js'

function generateId(prefix = 'tag') {
  const random = Math.random().toString(36).substring(2, 7)
  return `${prefix}-${random}`
}

export default function NewTagPage() {
  const router = useRouter()

  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('rent')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const getUser = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user) {
        router.push('/login')
      } else {
        setUser(data.user)
      }
    }

    getUser()
    setId(generateId())
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!user) {
      setError('You must be logged in to create a tag.')
      setLoading(false)
      return
    }

    const cleanedId = id.trim().toLowerCase().replace(/\s+/g, '-')

    const { error } = await supabase.from('messages').insert([
      {
        id: cleanedId,
        title,
        description,
        category,
        user_id: user.id, // 👤 Track creator ID
        featured: false,
        hidden: false,
      },
    ])

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push(`/tag/${cleanedId}`)
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Create a New OmniTag</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
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
          className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800"
        >
          {loading ? 'Creating...' : 'Create Tag'}
        </button>

        {error && <p className="text-red-500 text-center">{error}</p>}
      </form>
    </div>
  )
}
