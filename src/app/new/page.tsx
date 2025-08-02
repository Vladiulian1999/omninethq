import { Suspense } from 'react'
import NewClient from './_client'

export default function NewPageWrapper() {
  return (
    <Suspense fallback={null}>
      <NewClient />
    </Suspense>
  )
}
