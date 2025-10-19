// src/app/cancel/page.tsx
// Keep this page server-rendered and static. No Supabase, no env reads.
export const runtime = 'nodejs';
export const dynamic = 'force-static';

export default function CancelPage() {
  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Payment canceled</h1>
      <p className="text-gray-600">
        Your payment was canceled. You can close this page or return to the tag.
      </p>
      <div className="mt-4">
        <a href="/explore" className="inline-block rounded-xl border px-4 py-2 hover:bg-gray-50">
          Back to Explore
        </a>
      </div>
    </div>
  );
}

