import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js'

serve(async (req: Request) => {
  const body = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { record } = body

  const email = record?.email || ''
  if (!email) return new Response('Missing email', { status: 400 })

  // Replace this with actual email logic later
  console.log(`🎉 Welcome email should be sent to: ${email}`)

  return new Response('Welcome email logic complete', { status: 200 })
})

