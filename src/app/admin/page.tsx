'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TagWithUser = {
  id: string
  title: string
  description: string
  featured: boolean
  hidden: boolean
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
        .select('id, title, description, featured, hidden, users(email)')
        .order('created_at', { ascending: false })

      console.log('📦 DATA:', data)
      console.log('⚠️ ERROR:', error)

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
      <h1 className="text-3xl font-bold mb-6 text-center">Admin Panel</h1>

      {tags.length === 0 ? (
        <p className="text-center text-gray-500">No tags found.</p>
      ) : (
        <ul className="space-y-4">
          {tags.map((tag) => (
            <li key={tag.id} className="border p-4 rounded shadow">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-lg font-semibold">{tag.title}</h2>
                {tag.users?.[0]?.email && (
                  <span className="text-xs text-gray-500">
                    Owner: {tag.users[0].email}
                  </span>
                )}
              </div>
              <p className="text-gray-600 text-sm mb-1">{tag.description}</p>
              <div className="text-xs text-gray-400">
                ID: {tag.id} • {tag.featured ? '🌟 Featured' : ''}{' '}
                {tag.hidden ? '🚫 Hidden' : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
