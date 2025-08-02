import { Suspense } from 'react'
import NotFoundClient from './not-found/_client'

export default function NotFoundPage() {
  return (
    <Suspense fallback={<div>Loading 404...</div>}>
      <NotFoundClient />
    </Suspense>
  )
}
