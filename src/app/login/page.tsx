// /app/login/page.tsx
import { Suspense } from 'react'
import LoginClient from './_client'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading login...</div>}>
      <LoginClient />
    </Suspense>
  )
}
