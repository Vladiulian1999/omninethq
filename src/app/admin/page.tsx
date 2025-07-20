'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

type TagWithUser = {
  id: string
  title: string
  description: string
  featured: boolean
  hidden: boolean
  user_id: string
  users: {
    email: string
  }[]
}

export default function AdminPage() {
  const [tags, setTags] = useState<TagWithUser[]>([])

  useEffect(() => {
    const fetchTags = async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('id, title, description, featured, hidden, user_id, users:users(email)')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ Supabase fetch error:', JSON.stringify(error, null, 2))
      } else {
        setTags(data as TagWithUser[])
      }
    }

    fetchTags()
  }, [])

  const toggleFeatured = async (tagId: string, current: boolean) => {
    const { error } = await supabase
      .from('tags')
      .update({ featured: !current })
      .eq('id', tagId)

    if (error) {
      toast.error('Failed to update featured status')
      console.error(error)
    } else {
      toast.success(`Tag ${!current ? 'featured' : 'unfeatured'}`)
      setTags((prev) =>
        prev.map((tag) =>
          tag.id === tagId ? { ...tag, featured: !current } : tag
        )
      )
    }
  }

  const toggleHidden = async (tagId: string, current: boolean) => {
    const { error } = await supabase
      .from('tags')
      .update({ hidden: !current })
      .eq('id', tagId)

    if (error) {
      toast.error('Failed to update visibility')
      console.error(error)
    } else {
      toast.success(`Tag ${!current ? 'hidden' : 'unhidden'}`)
      setTags((prev) =>
        prev.map((tag) =>
          tag.id === tagId ? { ...tag, hidden: !current } : tag
        )
      )
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Admin Panel</h1>

      {tags.length === 0 ? (
        <p className="text-center text-gray-500">No tags found.</p>
      ) : (
        <ul className="space-y-4">
          {tags.map((tag) => (
            <li key={tag.id} className="border p-4 rounded shadow">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg font-semibold">{tag.title}</h2>
                {tag.users?.[0]?.email && (
                  <span className="text-xs text-gray-500">
                    Owner: {tag.users[0].email}
                  </span>
                )}
              </div>
              <p className="text-gray-600 text-sm mb-1">{tag.description}</p>
              <div className="text-xs text-gray-400 mb-2">
                ID: {tag.id} • {tag.featured ? '🌟 Featured' : ''}{' '}
                {tag.hidden ? '🚫 Hidden' : ''}
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => toggleFeatured(tag.id, tag.featured)}
                  className="text-sm px-3 py-1 rounded bg-blue-100 hover:bg-blue-200"
                >
                  {tag.featured ? 'Unfeature' : 'Feature'}
                </button>
                <button
                  onClick={() => toggleHidden(tag.id, tag.hidden)}
                  className="text-sm px-3 py-1 rounded bg-yellow-100 hover:bg-yellow-200"
                >
                  {tag.hidden ? 'Unhide' : 'Hide'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
