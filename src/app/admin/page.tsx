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
  scan_count: number
  created_at: string
  users: {
    email: string
  }[]
}

export default function AdminPage() {
  const [tags, setTags] = useState<TagWithUser[]>([])
  const [filter, setFilter] = useState<'all' | 'featured' | 'hidden'>('all')
  const [sortBy, setSortBy] = useState<'recent' | 'scanned' | 'title'>('recent')

  useEffect(() => {
    const fetchTags = async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('id, title, description, featured, hidden, user_id, scan_count, created_at, users:users(email)')
        .order('created_at', { ascending: false }) // default order, will re-sort client-side too

      if (error) {
        console.error('❌ Supabase fetch error:', JSON.stringify(error, null, 2))
        toast.error('Failed to fetch tags')
      } else {
        setTags(data as TagWithUser[])
      }
    }

    fetchTags()
  }, [])

  const filteredTags = tags
    .filter((tag) => {
      if (filter === 'featured') return tag.featured
      if (filter === 'hidden') return tag.hidden
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'recent') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      if (sortBy === 'scanned') {
        return (b.scan_count || 0) - (a.scan_count || 0)
      }
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title)
      }
      return 0
    })

  const toggleFeatured = async (tagId: string, current: boolean) => {
    const { error } = await supabase
      .from('tags')
      .update({ featured: !current })
      .eq('id', tagId)

    if (error) {
      toast.error('Failed to update featured status')
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
    } else {
      toast.success(`Tag ${!current ? 'hidden' : 'unhidden'}`)
      setTags((prev) =>
        prev.map((tag) =>
          tag.id === tagId ? { ...tag, hidden: !current } : tag
        )
      )
    }
  }

  const deleteTag = async (tagId: string) => {
    if (!confirm('Are you sure you want to delete this tag?')) return

    const { error } = await supabase.from('tags').delete().eq('id', tagId)

    if (error) {
      toast.error('Failed to delete tag')
    } else {
      toast.success('Tag deleted')
      setTags((prev) => prev.filter((tag) => tag.id !== tagId))
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Admin Panel</h1>

      <div className="mb-6 flex flex-wrap justify-center gap-4 items-center">
        {/* Filter buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-1 rounded ${
              filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('featured')}
            className={`px-4 py-1 rounded ${
              filter === 'featured' ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}
          >
            Featured
          </button>
          <button
            onClick={() => setFilter('hidden')}
            className={`px-4 py-1 rounded ${
              filter === 'hidden' ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}
          >
            Hidden
          </button>
        </div>

        {/* Sort dropdown */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'recent' | 'scanned' | 'title')}
          className="px-3 py-1 rounded border border-gray-300 text-sm"
        >
          <option value="recent">Sort by Most Recent</option>
          <option value="scanned">Sort by Most Scanned</option>
          <option value="title">Sort by Title (A–Z)</option>
        </select>
      </div>

      {filteredTags.length === 0 ? (
        <p className="text-center text-gray-500">No tags found for this filter.</p>
      ) : (
        <ul className="space-y-4">
          {filteredTags.map((tag) => (
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
                ID: {tag.id} • Scans: {tag.scan_count ?? 0} • {tag.featured ? '🌟 Featured' : ''}{' '}
                {tag.hidden ? '🚫 Hidden' : ''}
              </div>
              <div className="flex gap-3 flex-wrap">
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
                <button
                  onClick={() => deleteTag(tag.id)}
                  className="text-sm px-3 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
