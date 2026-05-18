'use client'

import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISS_KEY = 'a2hs_seen'

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

function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

export default function A2HSNudge() {
  const [show, setShow] = useState(false)
  const [platform, setPlatform] = useState<'ios-safari' | 'ios-other' | 'android' | 'other'>('other')
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return
    if (isStandalone()) return

    const isIOS = isiOS()
    const safari = isSafari()

    if (isIOS && safari) setPlatform('ios-safari')
    else if (isIOS && !safari) setPlatform('ios-other')
    else if (!isIOS) setPlatform('android')

    if (!isIOS) {
      const handler = (e: Event) => {
        e.preventDefault()
        setDeferred(e as BeforeInstallPromptEvent)
        window.setTimeout(() => setShow(true), 1200)
      }
      const installedHandler = () => {
        localStorage.setItem(DISMISS_KEY, '1')
        setShow(false)
      }

      window.addEventListener('beforeinstallprompt', handler)
      window.addEventListener('appinstalled', installedHandler)
      return () => {
        window.removeEventListener('beforeinstallprompt', handler)
        window.removeEventListener('appinstalled', installedHandler)
      }
    }

    window.setTimeout(() => setShow(true), 1800)
  }, [])

  async function installAndroid() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    localStorage.setItem(DISMISS_KEY, '1')
    setDeferred(null)
    setShow(false)
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-4 inset-x-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 text-slate-950 shadow-2xl backdrop-blur sm:bottom-5">
      {platform === 'android' ? (
        <>
          <div className="text-sm leading-snug">
            <div className="font-medium">Install OmniNet</div>
            <div className="text-slate-600">Add OmniNet to your home screen for faster access.</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={dismiss}>
              Not now
            </button>
            <button className="rounded-xl bg-slate-950 px-3 py-1.5 text-sm text-white hover:bg-slate-800" onClick={installAndroid}>
              Add
            </button>
          </div>
        </>
      ) : platform === 'ios-safari' ? (
        <>
          <div className="text-sm leading-snug">
            <div className="font-medium">Add OmniNet to your home screen</div>
            <div className="text-slate-600">
              Tap <span className="font-medium">Share</span>, then <span className="font-medium">Add to Home Screen</span>.
            </div>
          </div>
          <button className="shrink-0 rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={dismiss}>
            Got it
          </button>
        </>
      ) : platform === 'ios-other' ? (
        <>
          <div className="text-sm leading-snug">
            <div className="font-medium">Open in Safari to install</div>
            <div className="text-slate-600">iPhone only allows Add to Home Screen from Safari.</div>
          </div>
          <button className="shrink-0 rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={dismiss}>
            Okay
          </button>
        </>
      ) : null}
    </div>
  )
}
