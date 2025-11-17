// NO "use client" here
import { Suspense } from 'react';
import LoginClient from './_client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function Page({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const next =
    (typeof searchParams?.next === 'string' &&
      decodeURIComponent(searchParams.next)) ||
    '/explore';

  return (
    <Suspense fallback={<div className="p-8 text-center">Loading…</div>}>
      <LoginClient next={next} />
    </Suspense>
  );
}
