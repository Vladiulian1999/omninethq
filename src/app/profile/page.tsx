import { Suspense } from 'react'
import ProfileRouter from './_client'

export const metadata = {
  title: 'Profile • OmniNet',
}

export default function ProfilePage() {
  return (
    <Suspense>
      <ProfileRouter />
    </Suspense>
  )
}
