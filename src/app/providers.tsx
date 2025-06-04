'use client'

import { createBrowserClient } from '@supabase/ssr'
import { SessionContextProvider } from '@supabase/auth-helpers-react' // temporarily OK (comes from ssr deps)
import { useState } from 'react'

export default function Providers({ children }: { children: React.ReactNode }) {
  const [supabaseClient] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  )

  return (
    <SessionContextProvider supabaseClient={supabaseClient}>
      {children}
    </SessionContextProvider>
  )
}
