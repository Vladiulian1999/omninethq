import { Suspense } from 'react'
import dynamic from 'next/dynamic'

const UserPageClient = dynamic(() => import('./_client'))

export default function UserPageShell() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading...</div>}>
      <UserPageClient />
    </Suspense>
  )
}
