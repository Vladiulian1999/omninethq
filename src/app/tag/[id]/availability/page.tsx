import { Suspense } from 'react';
import AvailabilityClient from './_client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading availability…</div>}>
      <AvailabilityClient />
    </Suspense>
  );
}
