'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Props = {
  /** Full URL (https://...) or a storage path like "user-123/avatar.png" */
  src?: string | null
  /** Storage bucket if using paths (default: 'avatars') */
  bucket?: string
  alt?: string
  size?: number // px
}

export default function AvatarImage({
  src,
  bucket = 'avatars',
  alt = 'Avatar',
  size = 96,
}: Props) {
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const isHttp = useMemo(() => !!src && /^https?:\/\//i.test(src!), [src])

  useEffect(() => {
    let cancelled = false
    if (!src) {
      setImgUrl(null)
      return
    }

    if (isHttp) {
      setImgUrl(src!)
      return
    }

    // Storage path: try public URL first
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(src)
    if (pub?.publicUrl) {
      setImgUrl(pub.publicUrl)
      return
    }

    // Fallback to signed URL (if bucket is private)
    ;(async () => {
      try {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(src!, 3600)
        if (!cancelled) setImgUrl(error ? null : data?.signedUrl ?? null)
      } catch {
        if (!cancelled) setImgUrl(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [src, bucket, isHttp])

  if (!imgUrl) {
    return (
      <div
        className="rounded-full bg-gray-200 flex items-center justify-center text-gray-600"
        style={{ width: size, height: size }}
        aria-label="No avatar"
      >
        <span className="text-xs">no img</span>
      </div>
    )
  }

  return (
    <img
      src={imgUrl}
      alt={alt}
      width={size}
      height={size}
      className="rounded-full object-cover border"
      style={{ width: size, height: size }}
      loading="lazy"
    />
  )
}
