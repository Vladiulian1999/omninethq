import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return res

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options)
        })
      },
    },
  })

  // Refresh session if needed + get user
  const { data } = await supabase.auth.getUser()

  // Only protect what must be authed
  const pathname = req.nextUrl.pathname
  const isProtected =
    pathname.startsWith('/new') ||
    pathname.startsWith('/my') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/u')

  if (isProtected && !data.user) {
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  return res
}

export const config = {
  matcher: ['/new/:path*', '/my/:path*', '/admin/:path*', '/u/:path*'],
}
