'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useParams } from 'next/navigation'
import Image from 'next/image'

export default function UserPage() {
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  )

  const params = useParams()
  const userId = params?.id as string

  const [session, setSession] = useState<any>(null)
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const getSessionAndUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      setSession(session)

      const { data: userData } = await supabase
        .from('users')
        .select('username, bio, avatar_url')
        .eq('id', userId)
        .maybeSingle()

      if (userData) {
        setUsername(userData.username || '')
        setBio(userData.bio || '')
        setAvatarUrl(userData.avatar_url || '')
      }
    }

    getSessionAndUser()
  }, [supabase, userId])

  const handleSave = async () => {
    setSaving(true)

    await supabase
      .from('users')
      .update({ username, bio })
      .eq('id', userId)

    setSaving(false)
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return

    const fileExt = file.name.split('.').pop()
    const filePath = `${userId}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      alert('Failed to upload avatar.')
      return
    }

    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)

    const publicUrl = data?.publicUrl

    if (publicUrl) {
      setAvatarUrl(publicUrl)

      await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', userId)
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">User Profile</h1>

      <div className="mb-4">
        <label className="block mb-1">Avatar</label>
        <div className="mb-2">
          {avatarUrl && (
            <Image
              src={avatarUrl}
              alt="avatar"
              width={100}
              height={100}
              className="rounded-full"
            />
          )}
        </div>
        <input type="file" accept="image/*" onChange={handleAvatarChange} />
      </div>

      <div className="mb-4">
        <label className="block mb-1">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full border p-2 rounded"
        />
      </div>

      <div className="mb-4">
        <label className="block mb-1">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="w-full border p-2 rounded"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-black text-white px-4 py-2 rounded"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  )
}
