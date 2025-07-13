'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

type Tag = {
  id: string
  title: string
  description: string
  featured: boolean
  hidden: boolean
  user_email?: string
}

export default function AdminPage() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTags = async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, title, description, featured, hidden, users:users(email)')
        .order('id', { ascending: false })

      const enriched = (data || []).map((tag: any) => ({
        id: tag.id,
        title: tag.title,
        description: tag.description,
        featured: tag.featured,
        hidden: tag.hidden,
        user_email: tag.users?.email || '',
      }))

      setTags(enriched)
      setLoading(false)
    }

    fetchTags()
  }, [])

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading tags...</div>
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Admin Panel</h1>
      <div className="grid gap-4">
        {tags.map((tag) => (
          <div key={tag.id} className="border p-4 rounded shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold">{tag.title}</h2>
              <Link href={`/tag/${tag.id}`} className="text-sm text-blue-600 hover:underline">
                View Tag
              </Link>
            </div>
            <p className="text-sm text-gray-600">{tag.description}</p>
            <p className="text-xs text-gray-400 mt-2">
              📧 {tag.user_email || 'Unknown'} · {tag.featured ? '🌟 Featured' : '—'} ·{' '}
              {tag.hidden ? '🙈 Hidden' : 'Visible'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
