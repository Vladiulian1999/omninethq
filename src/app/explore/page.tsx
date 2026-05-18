// src/app/explore/page.tsx
import { Suspense } from "react";
import ExploreClient from "./_client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ExplorePage() {
  return (
    <div className="omni-page-bg relative min-h-screen overflow-hidden">
      <div className="omni-grid-bg pointer-events-none absolute inset-0 opacity-20" />
      <div className="relative z-10 p-6 max-w-5xl mx-auto">
        <div className="omni-panel mb-6 rounded-3xl p-6">
          <div className="mb-3 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-cyan-100">
            Live marketplace
          </div>
          <h1 className="text-3xl font-semibold text-white">Explore</h1>
          <p className="mt-2 text-sm text-slate-300">
            Scan-first local services. Real availability. No waiting.
          </p>
        </div>

        <Suspense fallback={<div className="omni-card rounded-2xl p-4 text-slate-300">Loading...</div>}>
          <ExploreClient />
        </Suspense>
      </div>
    </div>
  );
}
