'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TagWithUser = {
  id: string
  title: string
  description: string
  featured: boolean
  hidden: boolean
  users: { email: string }[] // ✅ Supabase returns an array
}

export default function AdminPage() {
  const [tags, setTags] = useState<TagWithUser[]>([])

  useEffect(() => {
    const fetchTags = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, title, description, featured, hidden, users(email)')

      if (error) {
        console.error('Error fetching tags:', error)
      } else {
        setTags(data as TagWithUser[])
      }
    }

    fetchTags()
  }, [])

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Admin Panel</h1>

      {tags.length === 0 ? (
        <p className="text-gray-600">No tags found.</p>
      ) : (
        <ul className="space-y-4">
          {tags.map((tag) => (
            <li key={tag.id} className="p-4 border rounded bg-white shadow">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-semibold">{tag.title}</h2>
                  <p className="text-sm text-gray-600">{tag.description}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Owner: {tag.users?.[0]?.email || 'Unknown'}
                  </p>
                </div>
                <div className="text-sm text-right">
                  <p>⭐ Featured: {tag.featured ? 'Yes' : 'No'}</p>
                  <p>🙈 Hidden: {tag.hidden ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
