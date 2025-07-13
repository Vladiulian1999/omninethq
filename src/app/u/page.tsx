'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BackButton } from '@/components/BackButton'

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

      setSession(session)

      const { data: userData } = await supabase
        .from('users')
        .select('username, bio, avatar_url')
        .eq('id', userIdFromUrl)
        .maybeSingle()

      if (userData) {
        setUsername(userData.username || '')
        setBio(userData.bio || '')
        setAvatarUrl(userData.avatar_url ? `${userData.avatar_url}?t=${Date.now()}` : '')
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

    if (publicUrl) {
      setAvatarUrl(`${publicUrl}?t=${Date.now()}`)

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
    return (
      <div className="text-center text-red-500 p-6">
        ❌ You cannot edit this profile.
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <BackButton />

      <h1 className="text-2xl font-bold mb-6 text-center">Your Profile</h1>

      <div className="flex flex-col items-center gap-4 mb-6">
        {avatarUrl && (
          <Image
            src={avatarUrl}
            alt="avatar"
            width={100}
            height={100}
            className="rounded-full object-cover"
          />
        )}
        <input
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="text-sm"
        />
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full border rounded p-2"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-black text-white py-2 rounded hover:bg-gray-800 transition"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
