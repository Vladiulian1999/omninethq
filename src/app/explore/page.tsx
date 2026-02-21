// src/app/explore/page.tsx
import { Suspense } from "react";
import ExploreClient from "./_client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ExplorePage() {
  return (
    <div className="min-h-screen bg-amber-50/60">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6 rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-amber-100/40 p-6 shadow-sm">
          <h1 className="text-3xl font-semibold text-amber-950">Explore</h1>
          <p className="mt-2 text-sm text-amber-900/70">
            Scan-first local services. Real availability. No waiting.
          </p>
        </div>

        <Suspense fallback={<div className="p-4">Loading…</div>}>
          <ExploreClient />
        </Suspense>
      </div>
    </div>
  );
}
