import LoginClient from './_client'

export const dynamic = 'force-dynamic'

export default function Page() {
  return <LoginClient nextUrl="/explore" />
}


