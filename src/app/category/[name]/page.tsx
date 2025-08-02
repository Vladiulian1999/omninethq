import { Suspense } from 'react'
import CategoryClient from './_client'

export default function CategoryPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CategoryClient />
    </Suspense>
  )
}
