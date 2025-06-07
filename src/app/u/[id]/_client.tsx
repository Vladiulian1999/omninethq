'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Tag = {
  id: string
  title: string
  description: string
  category: string
  views: number
  featured?: boolean
  created_at: string
}

type UserProfile = {
  email: string
  username?: string
  avatar_url?: string
  bio?: string
}

export default function UserClientPage({
  params,
  session,
  initialUser,
  initialTags,
}: {
  params: { id: string }
  session: any
  initialUser: UserProfile | null
  initialTags: Tag[]
}) {
  const userId = decodeURIComponent(params.id)
  const [tags, setTags] = useState<Tag[]>(initialTags)
  const [user, setUser] = useState<UserProfile | null>(initialUser)
  const [editing, setEditing] = useState(false)
  const [username, setUsername] = useState(initialUser?.username || '')
  const [bio, setBio] = useState(initialUser?.bio || '')
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Hydrate Supabase auth with session
  useEffect(() => {
    if (session?.access_token && session?.refresh_token) {
      supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }).then(({ data, error }) => {
        if (data?.user?.id) {
          setSessionUserId(data.user.id)
        }
      })
    }
  }, [session])

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !sessionUserId) return

    const ext = file.name.split('.').pop() || 'jpg'
    const filePath = `${sessionUserId}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: '3600',
      })

    if (uploadError) return console.error('Upload failed', uploadError)

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)

    const { error: updateError } = await supabase
      .from('users')
      .update({ avatar_url: urlData.publicUrl })
      .eq('id', sessionUserId)

    if (updateError) return console.error('Failed to update avatar URL', updateError)

    setUser((prev) => (prev ? { ...prev, avatar_url: urlData.publicUrl } : prev))
  }

  const handleSave = async () => {
    const updates: any = {}
    if (username.trim()) updates.username = username
    if (bio.trim()) updates.bio = bio

    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)

    if (error) {
      console.error('Error saving profile:', error)
      return
    }

    setUser((prev) => (prev ? { ...prev, username, bio } : prev))
    setEditing(false)
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="text-center mb-8">
        {user?.avatar_url ? (
          <img
            src={user.avatar_url}
            alt="User Avatar"
            className="w-24 h-24 mx-auto rounded-full object-cover"
          />
        ) : (
          <div className="w-24 h-24 mx-auto rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-3xl">
            {user?.email?.[0].toUpperCase()}
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleAvatarChange}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-blue-600 text-sm hover:underline mt-1"
          disabled={!sessionUserId}
        >
          📸 Change Avatar
        </button>
        <pre className="text-xs text-gray-400 mt-2">
          {JSON.stringify({ sessionUserId, userId }, null, 2)}
        </pre>

        {editing ? (
          <>
            <input
              className="mt-4 border px-3 py-1 rounded w-full text-center"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your name"
            />
            <textarea
              className="mt-2 border px-3 py-1 rounded w-full text-center"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Your bio"
            />
            <button
              onClick={handleSave}
              className="mt-2 bg-black text-white px-4 py-2 rounded hover:bg-gray-800"
            >
              Save
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold mt-4">{user?.username || user?.email}</h1>
            {user?.bio && <p className="text-gray-600 mt-1">{user.bio}</p>}
            <button
              onClick={() => setEditing(true)}
              className="text-blue-600 text-sm hover:underline mt-1"
            >
              ✏️ Edit Profile
            </button>
          </>
        )}
      </div>

      <h2 className="text-xl font-semibold mb-4">📦 {tags.length} Tags Created</h2>
      <ul className="space-y-4">
        {tags.map((tag) => (
          <li key={tag.id} className="border rounded p-4 shadow bg-white">
            <div className="flex justify-between items-center mb-1">
              <Link href={`/tag/${tag.id}`}>
                <h3 className="text-lg font-semibold hover:underline">{tag.title}</h3>
              </Link>
              {tag.featured && <span className="text-yellow-500 text-sm">✨</span>}
            </div>
            <p className="text-sm text-gray-600 mb-1">{tag.description}</p>
            <p className="text-xs text-gray-400">
              📅 {new Date(tag.created_at).toLocaleDateString()} | 👁️ {tag.views} views
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
