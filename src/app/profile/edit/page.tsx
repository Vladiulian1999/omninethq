
import { Suspense } from 'react'
import EditProfileClient from './_client'

export default function EditProfilePage() {
  return (
    <Suspense fallback={<div className="text-center p-6">Loading profile editor...</div>}>
      <EditProfileClient />
    </Suspense>
  )
}
