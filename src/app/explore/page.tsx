// /app/explore/page.tsx
import { Suspense } from 'react'
import ExploreClient from './_client'

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="text-center p-10 text-gray-500">Loading tags...</div>}>
      <ExploreClient />
    </Suspense>
  )
}
