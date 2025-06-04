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
}: {
  params: { id: string }
  session: any
}) {
  const userId = decodeURIComponent(params.id)
  const [tags, setTags] = useState<Tag[]>([])
  const [user, setUser] = useState<UserProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  //
  // ─── 1. HYDRATE CLIENT SESSION FROM SERVER ─────────────────────────────────
  //
  useEffect(() => {
    if (session?.access_token && session?.refresh_token) {
      supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
      setSessionUserId(session.user.id)
    } else {
      // If session is null, leave sessionUserId as null.
      // We still continue to load data below.
    }
  }, [session])

  //
  // ─── 2. FETCH TAGS & PROFILE ONCE (regardless of `sessionUserId`) ───────────
  //
  const fetchAll = async () => {
    setLoading(true)

    // 2a. Grab all “messages” (tags) for this userId (based on URL param)
    const { data: tagData, error: tagError } = await supabase
      .from('messages')
      .select('id, title, description, category, views, featured, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    // 2b. Grab this user’s profile info (email, username, avatar_url, bio)
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email, username, avatar_url, bio')
      .eq('id', userId)
      .maybeSingle()

    if (tagError || userError) {
      setError(tagError?.message || userError?.message || 'Error fetching data')
    } else {
      setTags(tagData || [])
      setUser(userData || null)
      setUsername(userData?.username || '')
      setBio(userData?.bio || '')
    }

    setLoading(false)
  }

  // Fire off the first fetch on mount
  useEffect(() => {
    fetchAll()
  }, [userId])

  //
  // ─── 3. HANDLE AVATAR UPLOAD ───────────────────────────────────────────────
  //      Only runs if sessionUserId is set (i.e. user is truly logged in)
  //
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !sessionUserId) {
      console.error('❌ No file or valid user session.')
      return
    }

    const ext = file.name.split('.').pop() || 'jpg'
    const filePath = `${sessionUserId}.${ext}`

    // 3a. Upload to Supabase Storage “avatars” bucket
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: '3600',
      })

    if (uploadError) {
      console.error('❌ Upload failed:', uploadError)
      return
    }

    // 3b. Retrieve the public URL
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)

    // 3c. Save that URL into the “users” table
    const { error: updateError } = await supabase
      .from('users')
      .update({ avatar_url: urlData.publicUrl })
      .eq('id', sessionUserId)

    if (updateError) {
      console.error('❌ Failed to update user with avatar URL:', updateError)
      return
    }

    // 3d. Refresh data so the new avatar appears immediately
    await fetchAll()
  }

  //
  // ─── 4. HANDLE SAVING USERNAME / BIO ────────────────────────────────────────
  //
  const handleSave = async () => {
    const updates: any = {}
    if (username.trim()) updates.username = username
    if (bio.trim()) updates.bio = bio

    const { error: saveError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)

    if (saveError) {
      console.error('Error saving profile:', saveError)
      return
    }

    await fetchAll()
    setEditing(false)
  }

  //
  // ─── 5. RENDER “LOADING…” UNTIL we have data or error ─────────────────────
  //
  if (loading) {
    return <div className="p-10 text-center text-gray-600">Loading…</div>
  }

  if (error) {
    return <div className="p-10 text-center text-red-600">Error: {error}</div>
  }

  //
  // ─── 6. RENDER THE PROFILE + TAGS ─────────────────────────────────────────
  //
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
          disabled={!sessionUserId} /* disable if not logged in */
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
        {tags.map((tagItem) => (
          <li key={tagItem.id} className="border rounded p-4 shadow bg-white">
            <div className="flex justify-between items-center mb-1">
              <Link href={`/tag/${tagItem.id}`}>
                <h3 className="text-lg font-semibold hover:underline">{tagItem.title}</h3>
              </Link>
              {tagItem.featured && <span className="text-yellow-500 text-sm">✨</span>}
            </div>
            <p className="text-sm text-gray-600 mb-1">{tagItem.description}</p>
            <p className="text-xs text-gray-400">
              📅 {new Date(tagItem.created_at).toLocaleDateString()} | 👁️ {tagItem.views} views
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
