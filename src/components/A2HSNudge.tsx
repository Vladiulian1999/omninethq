'use client'
import { useEffect, useState } from 'react'

function isiOS() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}
function isSafari() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isChrome = /CriOS/i.test(ua)
  const isFirefox = /FxiOS/i.test(ua)
  const safari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua)
  return safari && !isChrome && !isFirefox
}

export default function A2HSNudge() {
  const [show, setShow] = useState(false)
  const [platform, setPlatform] = useState<'ios-safari'|'ios-other'|'android'|'other'>('other')
  const [deferred, setDeferred] = useState<any>(null)

  useEffect(() => {
    if (localStorage.getItem('a2hs_seen')) return

    const isIOS = isiOS()
    const safari = isSafari()

    if (isIOS && safari) setPlatform('ios-safari')
    else if (isIOS && !safari) setPlatform('ios-other')
    else if (!isIOS) setPlatform('android')

    if (!isIOS) {
      const handler = (e: any) => { e.preventDefault(); setDeferred(e); setShow(true) }
      window.addEventListener('beforeinstallprompt', handler)
      return () => window.removeEventListener('beforeinstallprompt', handler)
    } else {
      // iOS: show instructional banner once
      setShow(true)
    }
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
      {platform === 'android' ? (
        <>
          <div className="text-sm leading-snug">
            <div className="font-medium">Install OmniNet</div>
            <div>Add it to your home screen for quick access.</div>
          </div>
          <button className="px-3 py-1.5 rounded-xl border" onClick={installAndroid}>Add</button>
        </>
      ) : platform === 'ios-safari' ? (
        <>
          <div className="text-sm leading-snug">
            <div className="font-medium">Add OmniNet to Home Screen</div>
            <div>Tap <span className="font-medium">Share</span> → <span className="font-medium">Add to Home Screen</span>.</div>
          </div>
          <button
            className="px-3 py-1.5 rounded-xl border"
            onClick={() => { localStorage.setItem('a2hs_seen','1'); setShow(false) }}
          >
            Got it
          </button>
        </>
      ) : platform === 'ios-other' ? (
        <>
          <div className="text-sm leading-snug">
            <div className="font-medium">Open in Safari to install</div>
            <div>iPhone only allows “Add to Home Screen” in Safari.</div>
          </div>
          <button
            className="px-3 py-1.5 rounded-xl border"
            onClick={() => { localStorage.setItem('a2hs_seen','1'); setShow(false) }}
          >
            Okay
          </button>
        </>
      ) : null}
    </div>
  )
}
