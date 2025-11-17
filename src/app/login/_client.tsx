'use client';

// Email + Password login (Sign in / Sign up / Reset), browser-only.
import { useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

type Mode = 'signin' | 'signup' | 'reset';

export default function LoginClient({ next }: { next: string }) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const goNext = () => {
    if (typeof window !== 'undefined') window.location.href = next || '/explore';
  };

  const onSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setMsg(null); setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) return setErr(error.message);
      goNext();
    } catch (e: any) {
      setErr(e?.message || 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setMsg(null); setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) return setErr(error.message);
      setMsg('Account created. Check your email to confirm (if required), then sign in.');
      setMode('signin');
    } catch (e: any) {
      setErr(e?.message || 'Sign up failed.');
    } finally {
      setLoading(false);
    }
  };

  const onReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setMsg(null); setLoading(true);
    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/login?next=${encodeURIComponent(next)}`
          : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) return setErr(error.message);
      setMsg('Password reset email sent. Check your inbox.');
      setMode('signin');
    } catch (e: any) {
      setErr(e?.message || 'Reset failed.');
    } finally {
      setLoading(false);
    }
  };

  const submit = mode === 'signin' ? onSignin : mode === 'signup' ? onSignup : onReset;

  return (
    <div className="p-8 max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-2">
        {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}
      </h1>
      <p className="text-sm text-gray-600 mb-6">
        {mode === 'signin'
          ? 'Use your email and password to sign in.'
          : mode === 'signup'
          ? 'Create an account with email and password.'
          : 'Enter your email and we’ll send a reset link.'}
      </p>

      {err && <div className="mb-3 text-sm text-red-600">{err}</div>}
      {msg && <div className="mb-3 text-sm text-green-700">{msg}</div>}

      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          placeholder="you@example.com"
          className="w-full border rounded-xl px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {mode !== 'reset' && (
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            className="w-full border rounded-xl px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl px-4 py-2 border hover:bg-gray-50 disabled:opacity-60"
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

      <p className="mt-6 text-xs text-gray-500">
        After signing in you’ll be redirected to <span className="font-mono">{next}</span>.
      </p>
    </div>
  );
}
