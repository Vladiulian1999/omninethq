import { Suspense } from 'react';
import FunnelClient from './_client';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-2">30-Day Funnel</h1>
      <p className="text-sm text-gray-500 mb-6">
        Share → Open → Donate/Book, last 30 days (sorted by conversion).
      </p>
      <Suspense fallback={<div>Loading…</div>}>
        <FunnelClient />
      </Suspense>
    </div>
  );
}
