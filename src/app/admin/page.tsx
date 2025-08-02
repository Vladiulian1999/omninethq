import { Suspense } from 'react'
import AdminClient from './_client'

export default function AdminPage() {
  return (
    <Suspense fallback={<div>Loading admin...</div>}>
      <AdminClient />
    </Suspense>
  )
}
