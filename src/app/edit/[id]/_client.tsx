'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function EditClient({ id }: { id: string }) {
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('title, description, category, user_id')
        .eq('id', id)
        .single()

      const { data: auth } = await supabase.auth.getUser()

      if (!data || error) {
        setError('Could not load tag.')
        setLoading(false)
        return
      }

      if (data.user_id !== auth.user?.id) {
        setError('You are not authorized to edit this tag.')
        setLoading(false)
        return
      }

      setTitle(data.title)
      setDescription(data.description)
      setCategory(data.category)
      setLoading(false)
    }

    fetchData()
  }, [id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const { error } = await supabase
      .from('messages')
      .update({ title, description, category })
      .eq('id', id)

    if (error) {
      setError(error.message)
      setSaving(false)
    } else {
      router.push('/my')
    }
  }

  if (loading) {
    return <p className="text-center p-10 text-gray-500">Loading...</p>
  }

  if (error) {
    return <p className="text-center p-10 text-red-500">{error}</p>
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4 text-center">Edit Tag</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          className="w-full border p-2 rounded"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <textarea
          className="w-full border p-2 rounded"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full border p-2 rounded"
          required
        >
          <option value="rent">🪜 Rent</option>
          <option value="help">🤝 Help</option>
          <option value="sell">🛒 Sell</option>
          <option value="teach">🎓 Teach</option>
        </select>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-black text-white px-4 py-2 rounded hover:bg-gray-800"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>

        {error && <p className="text-red-500 text-center">{error}</p>}
      </form>
    </div>
  )
}
