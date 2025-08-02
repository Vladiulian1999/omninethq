'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginClient() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    let authError = null

    if (mode === 'login') {
      const res = await supabase.auth.signInWithPassword({ email, password })
      authError = res.error
    } else {
      const referralCode = localStorage.getItem('referral_code')?.trim() || ''

      const signUpRes = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${location.origin}/explore`,
        },
      })

      authError = signUpRes.error

      if (!authError && signUpRes.data?.user) {
        const newUserId = signUpRes.data.user.id

        await supabase
          .from('users')
          .update({ referral_code: newUserId })
          .eq('id', newUserId)

        if (referralCode) {
          const refLookup = await supabase
            .from('users')
            .select('id')
            .eq('referral_code', referralCode)
            .single()

          const referredBy = refLookup.data?.id || null

          if (referredBy) {
            await supabase
              .from('users')
              .update({ referred_by: referredBy })
              .eq('id', newUserId)
          }
        }
      }
    }

    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      router.push('/explore')
    }
  }

  return (
    <div className="max-w-sm mx-auto p-6 text-center">
      <h1 className="text-2xl font-bold mb-4">
        {mode === 'login' ? 'Login to OmniNet' : 'Create an OmniNet Account'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          className="w-full border p-2 rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full border p-2 rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black text-white px-4 py-2 rounded hover:bg-gray-800"
        >
          {loading ? 'Processing...' : mode === 'login' ? 'Login' : 'Sign Up'}
        </button>

        {error && <p className="text-red-500 text-sm">{error}</p>}
      </form>

      <p className="mt-4 text-sm text-gray-600">
        {mode === 'login' ? "Don't have an account?" : 'Already registered?'}{' '}
        <button
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          className="text-blue-600 hover:underline"
        >
          {mode === 'login' ? 'Sign Up' : 'Log In'}
        </button>
      </p>
    </div>
  )
}
