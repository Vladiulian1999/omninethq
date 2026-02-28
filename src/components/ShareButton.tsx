'use client'

import React from 'react'
import toast from 'react-hot-toast'

type Props = {
  url: string
  title?: string
  className?: string
  children?: React.ReactNode
  onShared?: (method: 'share' | 'copy') => void
  onClick?: () => void // attempt hook (e.g., analytics)
}

export default function ShareButton({
  url,
  title = 'Check this out on OmniNet',
  className,
  children,
  onShared,
  onClick,
}: Props) {
  const handle = async () => {
    // Attempt hook: fires even if user cancels share sheet
    try {
      onClick?.()
    } catch {}

    try {
      // Native share (best UX on mobile)
      if (typeof navigator !== 'undefined' && 'share' in navigator && (navigator as any).share) {
        await (navigator as any).share({ title, url })
        onShared?.('share')
        // Optional: keep silent on successful native share (feels cleaner)
        return
      }

      // Fallback: copy link
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        throw new Error('Clipboard not available')
      }

      await navigator.clipboard.writeText(url)
      onShared?.('copy')
      toast.success('Link copied to clipboard')
    } catch (err) {
      toast.error('Could not share right now')
    }
  }

  return (
    <button onClick={handle} className={className || 'px-3 py-2 rounded-xl border hover:bg-gray-50 text-sm'}>
      {children ?? 'Share'}
    </button>
  )
}
