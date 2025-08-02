'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { QRCodeCanvas } from 'qrcode.react'
import { saveAs } from 'file-saver'

export default function UserProfileClient({ userId }: { userId: string }) {
  const [profile, setProfile] = useState({ username: '', bio: '', avatar_url: '' })
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [referralTagId, setReferralTagId] = useState('')
  const [referralCount, setReferralCount] = useState<number>(0)
  const qrRef = useRef<HTMLCanvasElement>(null)

  const referralLink = `https://omninethq.co.uk/?ref=${userId}`

  useEffect(() => {
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('username, bio, avatar_url')
        .eq('id', userId)
        .single()
      if (error) {
        toast.error('Error loading profile')
      } else {
        setProfile(data)
      }
      setLoading(false)
    }

    const checkOrCreateReferralTag = async () => {
      const existing = await supabase
        .from('messages')
        .select('id')
        .eq('id', `referral-${userId}`)
        .maybeSingle()

      if (!existing.data) {
        await supabase.from('messages').insert([
          {
            id: `referral-${userId}`,
            title: 'Join OmniNet with my invite',
            description: 'Scan this QR to sign up and start exploring OmniNet!',
            category: 'help',
            user_id: userId,
            featured: false,
            hidden: false,
          },
        ])
      }

      setReferralTagId(`referral-${userId}`)
    }

    const fetchReferralCount = async () => {
      const { count, error } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('referred_by', userId)

      if (!error && typeof count === 'number') {
        setReferralCount(count)
      }
    }

    fetchProfile()
    checkOrCreateReferralTag()
    fetchReferralCount()
  }, [userId])

  const updateProfile = async () => {
    const { error } = await supabase.from('users').update(profile).eq('id', userId)
    if (error) {
      toast.error('Failed to update')
    } else {
      toast.success('Profile updated!')
    }
  }

  const copyReferral = async () => {
    try {
      await navigator.clipboard.writeText(referralLink)
      toast.success('Referral link copied!')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const downloadQRCode = () => {
    const canvas = qrRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (blob) saveAs(blob, `referral-${userId}.png`)
    })
  }

  if (loading) return <p>Loading profile...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Your Profile</h1>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Username</label>
        <input
          value={profile.username}
          onChange={(e) => setProfile({ ...profile, username: e.target.value })}
          className="w-full p-2 border rounded"
        />

        <label className="block text-sm font-medium">Bio</label>
        <textarea
          value={profile.bio}
          onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          className="w-full p-2 border rounded"
        />

        <label className="block text-sm font-medium">Avatar URL</label>
        <input
          value={profile.avatar_url}
          onChange={(e) => setProfile({ ...profile, avatar_url: e.target.value })}
          className="w-full p-2 border rounded"
        />

        {profile.avatar_url && (
          <img
            src={profile.avatar_url}
            alt="Avatar"
            className="w-24 h-24 rounded-full mt-2 border"
          />
        )}

        <button
          onClick={updateProfile}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
        >
          Save Changes
        </button>
      </div>

      <div className="mt-8 p-4 border rounded bg-white shadow">
        <h3 className="text-lg font-semibold mb-2">Refer Friends 🚀</h3>
        <p className="text-sm text-gray-600 mb-2">
          Invite others using your link. Anyone who signs up through it will be linked to your account.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={referralLink}
            readOnly
            className="w-full md:w-auto flex-grow border px-3 py-1 rounded text-sm"
          />
          <button
            onClick={copyReferral}
            className="px-4 py-1 bg-blue-600 text-white rounded text-sm"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {referralTagId && (
          <div className="mt-6 text-center">
            <QRCodeCanvas value={`https://omninethq.co.uk/tag/${referralTagId}`} size={160} ref={qrRef} />
            <div className="mt-2 flex gap-2 justify-center">
              <button onClick={downloadQRCode} className="px-3 py-1 bg-black text-white text-sm rounded">
                Download QR
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(`https://omninethq.co.uk/tag/${referralTagId}`)}
                className="px-3 py-1 bg-gray-700 text-white text-sm rounded"
              >
                Copy Link
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 text-sm text-center text-gray-600">
          🧠 Total Referrals: <strong>{referralCount}</strong>
        </div>
      </div>
    </div>
  )
}
