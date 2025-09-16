'use client'
import { useEffect, useState } from 'react'

function isiOSSafari() {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua)
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua)
  return iOS && isSafari
}

export default function A2HSNudge() {
  const [deferred, setDeferred] = useState<any>(null)
  const [show, setShow] = useState(false)
  const [ios, setIos] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('a2hs_seen')) return

    const onBIP = (e: any) => {
      e.preventDefault()
      setDeferred(e)
      setShow(true)
    }

    setIos(isiOSSafari())

    // Android Chrome path
    window.addEventListener('beforeinstallprompt', onBIP)

    // iOS path → just show the educational banner once
    if (isiOSSafari()) {
      setShow(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', onBIP)
  }, [])

  async function installAndroid() {
    if (!deferred) return
    deferred.prompt()
    await deferred.userChoice
    localStorage.setItem('a2hs_seen', '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-4 inset-x-4 z-50 bg-white border shadow-lg rounded-2xl p-4 flex items-center justify-between gap-3">
      {ios ? (
        <>
          <div className="text-sm leading-snug">
            <div className="font-medium">Add OmniNet to your Home Screen</div>
            <div>Tap <span className="font-medium">Share</span> → <span className="font-medium">Add to Home Screen</span>.</div>
          </div>
          <button
            className="px-3 py-1.5 rounded-xl border"
            onClick={() => { localStorage.setItem('a2hs_seen','1'); setShow(false) }}
          >
            Got it
          </button>
        </>
      ) : (
        <>
          <div className="text-sm leading-snug">
            <div className="font-medium">Install OmniNet</div>
            <div>Get quick access from your home screen.</div>
          </div>
          <button className="px-3 py-1.5 rounded-xl border" onClick={installAndroid}>Add</button>
        </>
      )}
    </div>
  )
}
