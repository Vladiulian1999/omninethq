'use client';

import { useEffect, useState } from 'react';

export default function A2HSNudge({
  onceKey = 'a2hs_seen_v2',
}: { onceKey?: string }) {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // only once
    if (localStorage.getItem(onceKey)) return;

    const ua = window.navigator.userAgent.toLowerCase();
    const iOS = /iphone|ipad|ipod/.test(ua);
    const standalone = (window.navigator as any).standalone === true;
    setIsIOS(iOS);

    // iOS has no beforeinstallprompt
    if (iOS) {
      if (!standalone) setShow(true);
      return;
    }

    const handler = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [onceKey]);

  const dismiss = () => {
    localStorage.setItem(onceKey, '1');
    setShow(false);
  };

  const install = async () => {
    try {
      if (deferred) {
        deferred.prompt();
        await deferred.userChoice;
        dismiss();
      }
    } catch {
      // ignore
    }
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 z-50 bg-white border shadow-lg rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-black shrink-0" />
        <div className="text-sm">
          <div className="font-medium">Add OmniNet to Home Screen</div>
          {isIOS ? (
            <div className="text-gray-600 mt-1">
              Tap <span className="font-medium">Share</span> → <span className="font-medium">Add to Home Screen</span>
            </div>
          ) : (
            <div className="text-gray-600 mt-1">Get 1-tap access from your home screen.</div>
          )}
          <div className="mt-3 flex gap-2">
            {!isIOS && (
              <button onClick={install} className="px-3 py-1.5 rounded-xl border hover:bg-gray-50">
                Add
              </button>
            )}
            <button onClick={dismiss} className="px-3 py-1.5 rounded-xl border hover:bg-gray-50">
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
