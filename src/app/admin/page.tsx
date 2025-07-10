'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { BackButton } from '@/components/BackButton'

type Tag = {
  id: string
  title: string
  description: string
  category: string
  featured: boolean
  hidden: boolean
}

export default function AdminPage() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTags = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')

      if (error) {
        console.error('Error fetching tags:', error.message)
        setTags([])
      } else {
        setTags(data || [])
      }

      setLoading(false)
    }

    fetchTags()
  }, [])

  const toggleFeatured = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from('messages')
      .update({ featured: !current })
      .eq('id', id)

    if (!error) {
      setTags((prev) =>
        prev.map((t) => (t.id === id ? { ...t, featured: !current } : t))
      )
    } else {
      alert('❌ Failed to update featured: ' + error.message)
    }
  }

  const toggleHidden = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from('messages')
      .update({ hidden: !current })
      .eq('id', id)

    if (!error) {
      setTags((prev) =>
        prev.map((t) => (t.id === id ? { ...t, hidden: !current } : t))
      )
    } else {
      alert('❌ Failed to update hidden: ' + error.message)
    }
  }

  if (loading) return <p className="p-10 text-center">Loading...</p>

  const visibleTags = tags.filter((t) => !t.hidden)
  const hiddenTags = tags.filter((t) => t.hidden)

  return (
    <div className="max-w-4xl mx-auto p-6">
      <BackButton />
      <h1 className="text-3xl font-bold mb-6 text-center">🔧 Admin: Manage Tags</h1>

      {visibleTags.length === 0 ? (
        <p className="text-center text-gray-500">No visible tags found.</p>
      ) : (
        <div className="space-y-4">
          {visibleTags.map((tag) => (
            <div
              key={tag.id}
              className="border p-4 rounded bg-white shadow-sm flex justify-between items-center"
            >
              <Link href={`/tag/${tag.id}`} className="block group">
                <h2 className="text-lg font-semibold text-blue-700 group-hover:underline">
                  {tag.title}
                </h2>
                <p className="text-sm text-gray-600">{tag.description}</p>
                <p className="text-xs text-gray-400 mt-1">Category: {tag.category}</p>
              </Link>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleFeatured(tag.id, tag.featured)}
                  className={`text-sm px-3 py-1 rounded ${
                    tag.featured
                      ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                      : 'bg-gray-200 text-black hover:bg-gray-300'
                  }`}
                >
                  {tag.featured ? '🌟 Featured' : '☆ Not Featured'}
                </button>
                <button
                  onClick={() => toggleHidden(tag.id, tag.hidden)}
                  className="text-sm px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600"
                >
                  🗑 Hide
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {hiddenTags.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-semibold mb-4 text-center text-gray-600">🙈 Hidden Tags</h2>
          <div className="space-y-4">
            {hiddenTags.map((tag) => (
              <div
                key={tag.id}
                className="border p-4 rounded bg-gray-100 shadow-sm flex justify-between items-center"
              >
                <div>
                  <h2 className="text-lg font-semibold line-through">{tag.title}</h2>
                  <p className="text-sm text-gray-600">{tag.description}</p>
                  <p className="text-xs text-gray-400 mt-1">Category: {tag.category}</p>
                </div>
                <button
                  onClick={() => toggleHidden(tag.id, true)}
                  className="text-sm px-3 py-1 rounded bg-green-500 text-white hover:bg-green-600"
                >
                  ♻️ Unhide
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
