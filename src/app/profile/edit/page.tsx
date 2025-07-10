'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function EditProfilePage() {
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const router = useRouter()

  useEffect(() => {
    const fetchOrCreateUser = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (!user) return router.push('/login')

      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('username, bio, avatar_url')
        .eq('id', user.id)
        .maybeSingle()

      if (fetchError) {
        console.error('Error checking user row:', fetchError)
        return
      }

      if (!existingUser) {
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            id: user.id,
            username: '',
            bio: '',
            avatar_url: ''
          })

        if (insertError) {
          console.error('Error inserting blank user row:', insertError)
          return
        }

        setUsername('')
        setBio('')
        setAvatarUrl('')
      } else {
        setUsername(existingUser.username || '')
        setBio(existingUser.bio || '')
        setAvatarUrl(existingUser.avatar_url || '')
      }
    }

    fetchOrCreateUser()
  }, [])

  const handleSave = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const updates: any = {}
    if (username) updates.username = username
    if (bio) updates.bio = bio
    if (avatarUrl) updates.avatar_url = avatarUrl

    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user.id)

    if (error) {
      console.error('Error saving profile:', error)
      return
    }

    router.push(`/u/${user.id}`)
  }

  return (
    <div className="max-w-xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Edit Profile</h1>
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        className="w-full mb-3 p-2 border rounded"
      />
      <input
        type="text"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Bio"
        className="w-full mb-3 p-2 border rounded"
      />
      <input
        type="text"
        value={avatarUrl}
        onChange={(e) => setAvatarUrl(e.target.value)}
        placeholder="Avatar URL"
        className="w-full mb-3 p-2 border rounded"
      />
      <button
        onClick={handleSave}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Save
      </button>
    </div>
  )
}
