'use client';

import { useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import Link from 'next/link';

export default function LoginClient({ next }: { next: string }) {
  const sb = useMemo(() => getSupabaseBrowser(), []);
  const [mode, setMode] = useState<'signin'|'signup'|'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const goNext = () => {
    if (typeof window !== 'undefined') window.location.href = next || '/explore';
  };

  const onSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr(null); setMsg(null);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    goNext();
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr(null); setMsg(null);
    const { error } = await sb.auth.signUp({ email: email.trim(), password });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setMsg('Account created. Check your email to confirm (if required), then sign in.');
    setMode('signin');
  };

  const onReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr(null); setMsg(null);
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/login?next=${encodeURIComponent(next)}`
      : undefined;
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setMsg('Password reset email sent. Check your inbox.');
    setMode('signin');
  };

  return (
    <div className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-semibold mb-2">Sign {mode === 'signup' ? 'up' : mode === 'reset' ? 'in (reset)' : 'in'}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {mode === 'signup'
          ? 'Create an account with email and password.'
          : mode === 'reset'
          ? 'Enter your email to receive a password reset link.'
          : 'Use your email and password to sign in.'}
      </p>

      {err && <div className="mb-3 text-sm text-red-600">{err}</div>}
      {msg && <div className="mb-3 text-sm text-green-700">{msg}</div>}

      <form onSubmit={mode === 'signin' ? onSignin : mode === 'signup' ? onSignup : onReset} className="space-y-3">
        <input
          type="email"
          className="w-full border rounded px-3 py-2"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {mode !== 'reset' && (
          <input
            type="password"
            className="w-full border rounded px-3 py-2"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full border rounded-xl px-4 py-2 hover:bg-gray-50"
        >
          {loading
            ? 'Please wait…'
            : mode === 'signin'
            ? 'Sign in'
            : mode === 'signup'
            ? 'Create account'
            : 'Send reset link'}
        </button>
      </form>

      <div className="mt-4 text-sm flex items-center justify-between">
        {mode !== 'signin' ? (
          <button className="underline" onClick={() => setMode('signin')}>Have an account? Sign in</button>
        ) : (
          <button className="underline" onClick={() => setMode('signup')}>Create account</button>
        )}
        {mode !== 'reset' ? (
          <button className="underline" onClick={() => setMode('reset')}>Forgot password?</button>
        ) : (
          <button className="underline" onClick={() => setMode('signin')}>Back to sign in</button>
        )}
      </div>

      <div className="mt-6 text-xs text-gray-500">
        By continuing you agree to our{' '}
        <Link href="/terms" className="underline">Terms</Link> and{' '}
        <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </div>
    </div>
  );
}
