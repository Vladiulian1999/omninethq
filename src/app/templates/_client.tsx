'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type TagTemplate = {
  id: string
  title: string
  description: string
  category: string
  created_at: string
}

export default function TemplatesClient() {
  const [templates, setTemplates] = useState<TagTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const fetchTemplates = async () => {
      const { data, error } = await supabase
        .from('tag_templates')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to load templates', error)
      } else {
        setTemplates(data)
      }

      setLoading(false)
    }

    fetchTemplates()
  }, [])

  const useTemplate = (template: TagTemplate) => {
    const query = new URLSearchParams({
      title: template.title,
      description: template.description,
      category: template.category,
    }).toString()

    router.push(`/tag/new?${query}`)
  }

  if (loading) return <p className="text-center p-4">Loading templates...</p>

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Popular Tag Templates</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {templates.map((template) => (
          <div
            key={template.id}
            className="border rounded p-4 shadow bg-white"
          >
            <h2 className="text-lg font-semibold mb-1">{template.title}</h2>
            <p className="text-sm text-gray-700 mb-2">{template.description}</p>
            <span className="inline-block text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded mb-2">
              {template.category}
            </span>
            <button
              onClick={() => useTemplate(template)}
              className="w-full mt-2 px-4 py-1 text-sm bg-blue-600 text-white rounded"
            >
              Use This
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
