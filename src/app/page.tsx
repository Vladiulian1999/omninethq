'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070d] px-6 py-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(45,212,191,0.24),transparent_34%),radial-gradient(circle_at_18%_30%,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_82%_68%,rgba(244,114,182,0.15),transparent_30%)]" />
      <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#05070d] to-transparent" />

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col items-center justify-center text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100 shadow-[0_0_40px_rgba(34,211,238,0.12)] backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.9)]" />
          Live requests, tracked in one place
        </div>

        <h1 className="max-w-xl text-balance text-2xl font-semibold leading-[1.14] text-white sm:text-3xl lg:text-4xl">
          Stop losing customers between 'interested' and 'I'll message later.'
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
          Let people instantly reserve, enquire, claim, or book from a QR code or link &mdash; while you track every request in one place.
        </p>

        <div className="mt-9 flex w-full max-w-md flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
          <Link
            href="/explore"
            className="rounded-2xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-lime-200 px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_18px_60px_rgba(45,212,191,0.28)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_70px_rgba(45,212,191,0.38)]"
          >
            Explore Tags
          </Link>
          <Link
            href="/new"
            className="rounded-2xl border border-white/15 bg-white/[0.07] px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.12]"
          >
            Create a Tag
          </Link>
        </div>

        <div className="mt-12 grid w-full max-w-2xl grid-cols-1 gap-3 text-left text-xs text-slate-300 sm:grid-cols-3">
          {['Reserve now', 'Enquire instantly', 'Track every claim'].map((label) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 shadow-2xl backdrop-blur">
              <div className="mb-3 h-1.5 w-10 rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" />
              <div className="font-medium text-white">{label}</div>
              <div className="mt-1 text-slate-400">Real-world action, captured at the moment of intent.</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
