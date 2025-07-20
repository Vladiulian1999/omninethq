'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

type RawTag = {
  id: string
  title: string
  description: string
  user_id: string
  created_at: string
}

export default function AdminPage() {
  const [tags, setTags] = useState<RawTag[]>([])

  useEffect(() => {
    const fetchTags = async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .order('created_at', { ascending: false })

      console.log('✅ RAW TAG DATA:', data)
      console.log('⚠️ ERROR:', error)

      if (error) {
        toast.error('Error fetching tags')
      } else {
        setTags(data as RawTag[])
      }
    }

    fetchTags()
  }, [])

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Admin Panel (Raw Test)</h1>

      {tags.length === 0 ? (
        <p className="text-center text-gray-500">No tags found.</p>
      ) : (
        <ul className="space-y-4">
          {tags.map((tag) => (
            <li key={tag.id} className="border p-4 rounded shadow">
              <h2 className="text-lg font-semibold">{tag.title}</h2>
              <p className="text-gray-700 text-sm mb-1">{tag.description}</p>
              <p className="text-xs text-gray-500">User ID: {tag.user_id}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
