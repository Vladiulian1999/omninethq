import { Suspense } from 'react'
import LeaderboardClient from './_client'

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LeaderboardClient />
    </Suspense>
  )
}
