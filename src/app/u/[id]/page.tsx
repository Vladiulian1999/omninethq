// src/app/u/[id]/page.tsx

import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Tag = {
  id: string
  title: string
  description: string
  category: string
  views?: number
  featured?: boolean
}

const getCategoryBadge = (category: string) => {
  const base = 'inline-block px-3 py-1 rounded-full text-xs font-medium'
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

const getCategoryEmoji = (category: string) => {
  switch (category) {
    case 'rent': return '🪜'
    case 'sell': return '🛒'
    case 'teach': return '🎓'
    case 'help': return '🤝'
    default: return ''
  }
}

export default async function UserProfile({ params }: { params: { id: string } }) {
  const userId = decodeURIComponent(params.id)

  const { data: tags, error } = await supabase
    .from('messages')
    .select('id, title, description, category, views, featured')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="p-10 text-center text-red-600">
        <h1 className="text-2xl font-bold">Error</h1>
        <p>{error.message}</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold mb-1">👤 User Profile</h1>
        <p className="text-sm text-gray-500">User ID: {userId}</p>
      </div>

      {tags && tags.length > 0 ? (
        <ul className="space-y-6">
          {tags.map((tag) => (
            <li key={tag.id} className="p-4 bg-white rounded shadow border border-gray-100 hover:shadow-md transition">
              <div className="flex justify-between items-center mb-1">
                <Link href={`/tag/${tag.id}`}>
                  <h2 className="text-lg font-semibold hover:underline">
                    {getCategoryEmoji(tag.category)} {tag.title}
                  </h2>
                </Link>
                <span className={getCategoryBadge(tag.category)}>{tag.category}</span>
              </div>
              <p className="text-gray-600 text-sm">{tag.description}</p>
              {typeof tag.views === 'number' && (
                <p className="text-xs text-gray-400 mt-1">👁️ {tag.views} views</p>
              )}
              {tag.featured && (
                <p className="text-xs text-yellow-500 mt-1">✨ Featured</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-gray-500">No tags found for this user.</p>
      )}
    </div>
  )
}
