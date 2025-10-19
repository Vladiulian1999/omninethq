'use client';

// src/app/login/page.tsx
// Client-only login page that NEVER reads envs at build time.
// Uses the browser client factory when user submits the form.

import { useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowser(); // created only in the browser
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo:
            typeof window !== 'undefined'
              ? `${window.location.origin}/`
              : undefined,
        },
      });
      if (error) {
        setError(error.message);
      } else {
        setSent(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Sign in</h1>
      <p className="text-gray-600 mb-4">
        We’ll email you a magic link to sign in.
      </p>

      {sent ? (
        <div className="rounded-xl border p-4 bg-white shadow-sm">
          <div className="font-medium mb-1">Check your email</div>
          <div className="text-sm text-gray-600">
            We sent a link to <span className="font-mono">{email}</span>.
          </div>
        </div>
      ) : (
        <form onSubmit={sendMagicLink} className="space-y-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            className="w-full border rounded-xl px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl px-4 py-2 border hover:bg-gray-50 disabled:opacity-60"
          >
            {loading ? 'Sending…' : 'Send magic link'}
          </button>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </form>
      )}
    </div>
  );
}
