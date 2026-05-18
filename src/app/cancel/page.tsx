// src/app/cancel/page.tsx
// Keep this page server-rendered and static. No Supabase, no env reads.
export const runtime = 'nodejs';
export const dynamic = 'force-static';

export default function CancelPage() {
  return (
    <div className="omni-page-bg relative min-h-screen overflow-hidden px-4 py-8 text-white">
      <div className="omni-grid-bg pointer-events-none absolute inset-0 opacity-20" />
      <div className="relative z-10 mx-auto max-w-xl">
      <div className="omni-panel rounded-2xl p-6">
      <h1 className="mb-2 text-2xl font-semibold text-white">Payment canceled</h1>
      <p className="text-slate-300">
        Your payment was canceled. You can close this page or return to the tag.
      </p>
      <div className="mt-4">
        <a href="/explore" className="omni-button-secondary inline-block rounded-xl px-4 py-2">
          Back to Explore
        </a>
      </div>
      </div>
      </div>
    </div>
  );
}

