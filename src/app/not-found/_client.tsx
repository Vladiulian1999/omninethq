'use client'

import { useSearchParams } from 'next/navigation'

export default function NotFoundClient() {
  const searchParams = useSearchParams()
  const ref = searchParams.get('ref')

  return (
    <div className="text-center p-10">
      <h1 className="text-4xl font-bold mb-4">404 – Page Not Found</h1>
      {ref && (
        <p className="text-sm text-gray-500">
          We couldn’t find a page for ref <code>{ref}</code>
        </p>
      )}
    </div>
  )
}
