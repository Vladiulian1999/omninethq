'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../../../lib/supabaseClient'

export default function UserPage() {
  const params = useParams()
  const userIdFromUrl = params?.id as string

  const [session, setSession] = useState<any>(null)
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getSessionAndUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      console.log('👤 Session user ID:', session?.user?.id)
      console.log('🔗 URL user ID:', userIdFromUrl)

      setSession(session)

      const { data: userData } = await supabase
        .from('users')
        .select('username, bio, avatar_url')
        .eq('id', userIdFromUrl)
        .maybeSingle()

      if (userData) {
        setUsername(userData.username || '')
        setBio(userData.bio || '')
        setAvatarUrl(userData.avatar_url || '')
      }

      setLoading(false)
    }

    getSessionAndUser()
  }, [userIdFromUrl])

  const handleSave = async () => {
    if (!session) return
    setSaving(true)

    const { error } = await supabase
      .from('users')
      .update({ username, bio })
      .eq('id', session.user.id)

    if (error) {
      console.error('❌ Failed to save profile:', error)
      alert('Failed to save profile.')
    }

    setSaving(false)
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !session) return

    const fileExt = file.name.split('.').pop()
    const filePath = `${session.user.id}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: '3600',
      })

    if (uploadError) {
      console.error('❌ Avatar upload failed:', uploadError)
      alert('Failed to upload avatar.')
      return
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
    const publicUrl = data?.publicUrl

    console.log('🖼 Public avatar URL:', publicUrl) // ✅ Added log here

    if (publicUrl) {
      setAvatarUrl(publicUrl)

      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', session.user.id)

      if (updateError) {
        console.error('❌ Avatar URL update failed:', updateError)
        alert('Failed to save avatar URL.')
      }
    }
  }

  if (loading) {
    return <div className="text-center p-6">Loading profile...</div>
  }

  if (session?.user.id !== userIdFromUrl) {
    console.log('❌ BLOCKED: session ID does not match profile ID')
    return <div className="text-center text-red-500 p-6">❌ You cannot edit this profile.</div>
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
