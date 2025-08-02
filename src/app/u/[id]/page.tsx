import { Suspense } from 'react'
import UserProfileClient from './_client'

export default function UserProfilePage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UserProfileClient userId={params.id} />
    </Suspense>
  )
}
