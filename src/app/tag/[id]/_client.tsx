'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import QRCode from 'react-qr-code'
import { toPng } from 'html-to-image'
import Link from 'next/link'
import ScanAnalytics from '@/components/ScanAnalytics'
import { AvailabilityForm } from './AvailabilityForm'
import { BackButton } from '@/components/BackButton'
import toast, { Toaster } from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type FeedbackEntry = {
  id: string
  tag_id: string
  name: string
  message: string
  rating: number
  created_at: string
  hidden?: boolean
}

type Props = {
  tagId: string
  scanChartData: { date: string; count: number }[]
}

export default function TagClient({ tagId, scanChartData }: Props) {
  const [data, setData] = useState<any>(null)
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [rating, setRating] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [scanCount, setScanCount] = useState<number>(0)
  const [availability, setAvailability] = useState<any[]>([])
  const qrRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchTag = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('title, description, category, views, featured, user_id')
        .eq('id', tagId)
        .single()

      if (error) {
        setError(error.message)
      } else {
        setData(data)
        await supabase.rpc('increment_views', { row_id: tagId })
      }
    }

    const fetchFeedback = async () => {
      const { data } = await supabase
        .from('feedback')
        .select('*')
        .eq('tag_id', tagId)
        .eq('hidden', false)
        .order('created_at', { ascending: false })
      setFeedback(data || [])
    }

    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUserId(data?.user?.id || null)
      return data?.user?.id || null
    }

    const logScan = async () => {
      await supabase.from('scans').insert([{ tag_id: tagId, created_at: new Date().toISOString() }])
      const { count } = await supabase
        .from('scans')
        .select('*', { count: 'exact', head: true })
        .eq('tag_id', tagId)
      setScanCount(count || 0)
    }

    fetchTag()
    fetchFeedback()
    getUser().then((uid) => {
      if (uid) {
        const fetchAvailability = async () => {
          const { data: availability } = await supabase
            .from('availability')
            .select('*')
            .eq('tag_id', tagId)
            .eq('user_id', uid)
          setAvailability(availability || [])
        }
        fetchAvailability()
      }
    })
    logScan()
  }, [tagId])

  const isOwner = userId && data?.user_id && userId === data.user_id

  const handleDownload = async () => {
    if (!qrRef.current) return
    const dataUrl = await toPng(qrRef.current)
    const link = document.createElement('a')
    link.download = `${tagId}-qr.png`
    link.href = dataUrl
    link.click()
    toast.success('📥 QR code downloaded!')
  }

  const handleCopyLink = () => {
    const url = `https://omninethq.co.uk/tag/${tagId}`
    navigator.clipboard.writeText(url)
    toast.success('🔗 Link copied to clipboard!')
  }

  const handleDonate = async () => {
    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagId }),
    })

    const data = await res.json()
    if (data?.url) {
      window.location.href = data.url
    } else {
      toast.error('❌ Failed to create Stripe session')
    }
  }

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('feedback').insert([{
      tag_id: tagId,
      name: name || 'Anonymous',
      message,
      rating,
    }])
    if (!error) {
      setName('')
      setMessage('')
      setRating('')
      const { data } = await supabase
        .from('feedback')
        .select('*')
        .eq('tag_id', tagId)
        .eq('hidden', false)
        .order('created_at', { ascending: false })
      setFeedback(data || [])
      toast.success('✅ Feedback submitted!')
    } else {
      toast.error('❌ Failed to submit feedback')
    }
  }

  const handleDeleteFeedback = async (id: string) => {
    if (!confirm('Are you sure you want to hide this comment?')) return
    const { error } = await supabase
      .from('feedback')
      .update({ hidden: true })
      .eq('id', id)
    if (!error) {
      setFeedback((prev) => prev.filter((f) => f.id !== id))
      toast.success('🗑 Feedback hidden')
    } else {
      toast.error('❌ Failed to hide feedback')
    }
  }

  const getCategoryBadge = (category: string) => {
    const base = 'inline-block px-3 py-1 rounded-full text-xs font-medium'
    switch (category) {
      case 'rent': return `${base} bg-blue-100 text-blue-800`
      case 'sell': return `${base} bg-green-100 text-green-800`
      case 'teach': return `${base} bg-yellow-100 text-yellow-800`
      case 'help': return `${base} bg-purple-100 text-purple-800`
      default: return `${base} bg-gray-100 text-gray-800`
    }
  }

  const getCategoryEmoji = (category: string) => {
    switch (category) {
      case 'rent': return '🪜'
      case 'sell': return '🛒'
      case 'teach': return '🎓'
      case 'help': return '🤝'
      default: return ''
    }
  }

  const averageRating = feedback.length
    ? (feedback.reduce((sum, f) => sum + (f.rating || 0), 0) / feedback.length).toFixed(1)
    : null

  if (error || !data) {
    return (
      <div className="p-10 text-center text-red-600">
        <h1 className="text-2xl font-bold">Tag Not Found</h1>
        <p>ID: {tagId}</p>
      </div>
    )
  }

  return (
    <div className="p-10 text-center">
      <Toaster position="top-center" />
      <BackButton />

      <h1 className="text-3xl font-bold mb-2">{data.title}</h1>
      {data.featured && (
        <p className="text-sm text-yellow-600 mb-2">✨ Featured by OmniNet</p>
      )}
      <p className="text-gray-600 mb-2">{data.description}</p>

      <Link href={`/category/${data.category}`}>
        <span className={getCategoryBadge(data.category)}>
          {getCategoryEmoji(data.category)} {data.category}
        </span>
      </Link>

      <p className="text-sm text-gray-400 mt-4 mb-1">Tag ID: {tagId}</p>
      <p className="text-xs text-gray-500 mb-1">🔢 {scanCount} scans</p>

      {typeof data.views === 'number' && (
        <p className="text-xs text-gray-500 mb-4">👁️ {data.views} views</p>
      )}

      <div className="flex flex-col items-center gap-3 mb-8">
        <div ref={qrRef} className="bg-white p-3 rounded shadow">
          <QRCode value={`https://omninethq.co.uk/tag/${tagId}`} size={160} level="H" />
        </div>

        <p className="text-sm text-gray-500">📱 Scan this QR to view this tag instantly</p>

        <div className="flex gap-3 mt-2">
          <button onClick={handleDownload} className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition text-sm">📥 Download QR</button>
          <button onClick={handleCopyLink} className="bg-gray-200 text-black px-4 py-2 rounded hover:bg-gray-300 transition text-sm">🔗 Copy Link</button>
          <button onClick={handleDonate} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition text-sm">💸 Support this Tag</button>
        </div>
      </div>

      <ScanAnalytics data={scanChartData} />

      {isOwner && (
        <div className="my-8">
          <AvailabilityForm tagId={tagId} userId={userId!} initialAvailability={availability} />
        </div>
      )}

      <hr className="my-8 border-gray-300" />

      <h2 className="text-xl font-semibold mb-4">💬 Feedback</h2>

      {averageRating && (
        <p className="text-sm text-yellow-600 mb-2">
          ⭐ Average Rating: {averageRating} ({feedback.length} reviews)
        </p>
      )}

      <ul className="space-y-4 mb-6 max-w-lg mx-auto text-left">
        {feedback.map((f) => (
          <li key={f.id} className="border p-3 rounded bg-white shadow">
            <div className="flex justify-between items-center mb-1">
              <p className="text-sm text-gray-700">⭐ {f.rating} by {f.name}</p>
              {userId && (
                <button
                  onClick={() => handleDeleteFeedback(f.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  🗑 Hide
                </button>
              )}
            </div>
            <p className="text-sm text-gray-800">{f.message}</p>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmitFeedback} className="space-y-3 text-left max-w-md mx-auto">
        <input className="w-full border p-2 rounded" placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className="w-full border p-2 rounded" placeholder="Your comment..." value={message} onChange={(e) => setMessage(e.target.value)} required />
        <select className="w-full border p-2 rounded" value={rating} onChange={(e) => setRating(Number(e.target.value))} required>
          <option value="">Rate this tag</option>
          {[1, 2, 3, 4, 5].map((r) => (
            <option key={r} value={r}>{r} ⭐</option>
          ))}
        </select>
        <button type="submit" className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800">Submit Feedback</button>
      </form>
    </div>
  )
}
