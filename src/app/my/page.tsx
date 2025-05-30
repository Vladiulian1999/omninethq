'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Tag = {
  id: string
  title: string
  description: string
  category: string
  views?: number
  average_rating?: number
  review_count?: number
}

export default function MyTagsPage() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const router = useRouter()

  const fetchUserAndTags = useCallback(async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser()

    if (userError || !userData.user) {
      router.push('/login')
      return
    }

    const { data: rawTags } = await supabase
      .from('messages')
      .select('id, title, description, category, views')
      .eq('user_id', userData.user.id)

    const { data: feedback } = await supabase
      .from('feedback')
      .select('tag_id, rating')
      .eq('hidden', false)

    const tagStats: Record<string, { sum: number; count: number }> = {}
    feedback?.forEach((f) => {
      if (!tagStats[f.tag_id]) tagStats[f.tag_id] = { sum: 0, count: 0 }
      tagStats[f.tag_id].sum += f.rating
      tagStats[f.tag_id].count += 1
    })

    const enriched = (rawTags || []).map((tag) => {
      const stats = tagStats[tag.id]
      return {
        ...tag,
        average_rating: stats ? stats.sum / stats.count : undefined,
        review_count: stats ? stats.count : 0,
      }
    })

    setTags(enriched)
    setLoading(false)
  }, [router])

  useEffect(() => {
    fetchUserAndTags()
  }, [fetchUserAndTags])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tag?')) return
    setDeletingId(id)

    const { error } = await supabase.from('messages').delete().eq('id', id)

    if (error) {
      alert('Failed to delete: ' + error.message)
    } else {
      setTags((prev) => prev.filter((tag) => tag.id !== id))
    }

    setDeletingId(null)
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">My Tags</h1>

      {loading ? (
        <p className="text-center text-gray-500">Loading...</p>
      ) : tags.length === 0 ? (
        <p className="text-center text-gray-600">
          You haven&apos;t created any tags yet.{' '}
          <Link href="/new" className="text-blue-600 hover:underline">
            Create one now.
          </Link>
        </p>
      ) : (
        <ul className="space-y-4">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="border p-4 rounded shadow-sm bg-white hover:bg-gray-50"
            >
              <Link href={`/tag/${tag.id}`}>
                <h2 className="text-xl font-semibold">{tag.title}</h2>
              </Link>
              <p className="text-gray-600">{tag.description}</p>
              <p className="text-sm text-gray-400 mt-1">Category: {tag.category}</p>
              <p className="text-xs text-gray-400">ID: {tag.id}</p>

              {/* 📊 Stats */}
              <div className="text-xs text-gray-600 mt-2 flex gap-4">
                <span>👁️ {tag.views ?? 0} views</span>
                <span>⭐ {(tag.average_rating ?? 0).toFixed(1)} rating</span>
                <span>💬 {tag.review_count ?? 0} reviews</span>
              </div>

              <div className="mt-3 flex gap-3">
                <Link
                  href={`/edit/${tag.id}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  ✏️ Edit
                </Link>
                <button
                  onClick={() => handleDelete(tag.id)}
                  disabled={deletingId === tag.id}
                  className="text-sm text-red-600 hover:underline"
                >
                  {deletingId === tag.id ? 'Deleting...' : '🗑 Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

