'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { BackButton } from '@/components/BackButton'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type TagWithUser = {
  id: string
  title: string
  description: string
  featured: boolean
  hidden: boolean
  users?: { email: string }[] | null
}

export default function AdminPage() {
  const [tags, setTags] = useState<TagWithUser[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchTags = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, title, description, featured, hidden, users:users(email)')
        .order('id', { ascending: false })

      if (error) {
        console.error('Error fetching tags:', error)
        setError('Failed to fetch tags')
      } else {
        setTags(data || [])
      }
    }

    fetchTags()
  }, [])

  return (
    <div className="max-w-6xl mx-auto p-6">
      <BackButton />
      <h1 className="text-3xl font-bold mb-6 text-center">Admin Panel</h1>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      {tags.length === 0 ? (
        <p className="text-center text-gray-600">No tags found.</p>
      ) : (
        <table className="w-full text-sm border-collapse border">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-2 border">ID</th>
              <th className="p-2 border">Title</th>
              <th className="p-2 border">Description</th>
              <th className="p-2 border">Email</th>
              <th className="p-2 border">Featured</th>
              <th className="p-2 border">Hidden</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <tr key={tag.id} className="border-t hover:bg-gray-50">
                <td className="p-2 border">{tag.id}</td>
                <td className="p-2 border">{tag.title}</td>
                <td className="p-2 border">{tag.description}</td>
                <td className="p-2 border">{tag.users?.[0]?.email ?? 'N/A'}</td>
                <td className="p-2 border">{tag.featured ? '✅' : '❌'}</td>
                <td className="p-2 border">{tag.hidden ? '🙈' : '👁️'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
