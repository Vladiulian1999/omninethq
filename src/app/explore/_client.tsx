'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { BackButton } from '@/components/BackButton'

type Tag = {
  id: string
  title: string
  description: string
  category?: string
  average_rating?: number
  featured?: boolean
  hidden?: boolean
}

const categories = ['all', 'rent', 'help', 'sell', 'teach']

const getCategoryBadge = (category: string) => {
  const base = 'inline-block text-xs px-2 py-1 rounded-full font-medium'
  switch (category) {
    case 'rent':
      return `${base} bg-blue-100 text-blue-800`
    case 'sell':
      return `${base} bg-green-100 text-green-800`
    case 'teach':
      return `${base} bg-yellow-100 text-yellow-800`
    case 'help':
      return `${base} bg-purple-100 text-purple-800`
    default:
      return `${base} bg-gray-100 text-gray-800`
  }
}

const getCategoryEmoji = (category?: string) => {
  switch (category) {
    case 'rent':
      return '🪜'
    case 'sell':
      return '🛒'
    case 'teach':
      return '🎓'
    case 'help':
      return '🤝'
    default:
      return ''
  }
}

export default function ExploreClient() {
  const [tags, setTags] = useState<Tag[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTags = async () => {
      const { data: tagsData } = await supabase
        .from('messages')
        .select('id, title, description, category, featured, hidden')
        .eq('hidden', false)
        .order('id', { ascending: false })

      const { data: feedback } = await supabase
        .from('feedback')
        .select('tag_id, rating')
        .eq('hidden', false)

      const tagRatings: Record<string, { sum: number; count: number }> = {}

      feedback?.forEach((f) => {
        if (!tagRatings[f.tag_id]) {
          tagRatings[f.tag_id] = { sum: 0, count: 0 }
        }
        tagRatings[f.tag_id].sum += f.rating
        tagRatings[f.tag_id].count += 1
      })

      const enriched = (tagsData || []).map((tag) => {
        const ratingData = tagRatings[tag.id]
        return {
          ...tag,
          average_rating: ratingData ? ratingData.sum / ratingData.count : undefined,
        }
      })

      setTags(enriched)
      setLoading(false)
    }

    fetchTags()
  }, [])

  const trimmedSearch = search.trim().toLowerCase()

  const filteredTags = tags.filter((tag) => {
    const matchesCategory =
      selectedCategory === 'all' || tag.category === selectedCategory

    const matchesSearch = trimmedSearch
      ? trimmedSearch
          .split(/\s+/)
          .some((word) =>
            tag.title.toLowerCase().includes(word) ||
            tag.description.toLowerCase().includes(word) ||
            tag.id.toLowerCase().includes(word)
          )
      : true

    return matchesCategory && matchesSearch
  })

  const featuredTags = filteredTags.filter((tag) => tag.featured)
  const regularTags = filteredTags.filter((tag) => !tag.featured)

  return (
    <div className="max-w-4xl mx-auto p-6">
      <BackButton />

      <h1 className="text-3xl font-bold mb-4 text-center">🔎 Explore OmniTags</h1>

      <input
        type="text"
        placeholder="Search tags..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border p-2 rounded mb-4"
      />

      <div className="flex gap-2 flex-wrap mb-6 justify-center">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 rounded border text-sm transition ${
              selectedCategory === cat
                ? 'bg-black text-white'
                : 'bg-white text-black border-gray-300'
            }`}
          >
            {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-gray-500">Loading tags...</p>
      ) : filteredTags.length === 0 ? (
        <div className="text-center text-gray-500">
          <p>No matching tags found.</p>
          <p className="mt-2">
            Want to create one?{' '}
            <Link href="/new" className="text-blue-600 hover:underline">
              Click here
            </Link>
          </p>
        </div>
      ) : (
        <>
          {featuredTags.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-2">🌟 Featured Tags</h2>
              <div className="grid gap-3">
                {featuredTags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/tag/${tag.id}`}
                    className="block border rounded p-4 hover:bg-yellow-50 transition shadow-sm"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <h3 className="text-md font-semibold">
                        {getCategoryEmoji(tag.category)} {tag.title}
                      </h3>
                      {tag.category && (
                        <span className={getCategoryBadge(tag.category)}>
                          {tag.category}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{tag.description}</p>
                    <p className="text-xs text-yellow-600 mt-1">✨ Hand-picked by OmniNet</p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4">
            {regularTags.map((tag) => (
              <Link
                href={`/tag/${tag.id}`}
                key={tag.id}
                className="block border rounded p-4 hover:bg-gray-50 transition shadow-sm"
              >
                <div className="flex justify-between items-center mb-1">
                  <h2 className="text-lg font-semibold">
                    {getCategoryEmoji(tag.category)} {tag.title}
                  </h2>
                  {tag.category && (
                    <span className={getCategoryBadge(tag.category)}>
                      {tag.category}
                    </span>
                  )}
                </div>
                <p className="text-gray-600 text-sm">{tag.description}</p>
                <p className="text-xs text-gray-400 mt-1">ID: {tag.id}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
