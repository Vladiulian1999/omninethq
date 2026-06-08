'use client'

import { FormEvent, useState } from 'react'

const problemPoints = [
  'Lost income from appointments that cannot be recovered',
  'Wasted preparation time before a client simply does not arrive',
  'Empty calendar slots that could have gone to paying clients',
  'Awkward fee conversations after the damage is already done',
  'Repeat offenders who keep taking priority over reliable clients',
  'Manual enforcement that drains time and creates inconsistency',
]

const businessChoices = ['Enforce', 'Waive', 'Reschedule']

const industries = ['Therapists', 'Tutors', 'Consultants', 'Driving Instructors', 'Clinics', 'Salons']

export default function CommitmentPage() {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setSubmitted(false)
    setErrorMessage(null)

    const form = event.currentTarget
    const formData = new FormData(form)

    try {
      const response = await fetch('/api/commitment-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          businessType: formData.get('businessType'),
          biggestProblem: formData.get('biggestProblem'),
        }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.ok) {
        setErrorMessage(result?.error || 'We could not save your signup right now. Please try again.')
        return
      }

      setSubmitted(true)
      form.reset()
    } catch {
      setErrorMessage('We could not save your signup right now. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070d] px-5 py-10 text-white sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(45,212,191,0.2),transparent_34%),radial-gradient(circle_at_14%_24%,rgba(59,130,246,0.16),transparent_30%),radial-gradient(circle_at_86%_72%,rgba(244,114,182,0.12),transparent_28%)]" />
      <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.11)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-[#05070d] to-transparent" />

      <div className="relative z-10 mx-auto max-w-6xl">
        <section className="flex min-h-[calc(100vh-6rem)] flex-col justify-center gap-10 py-10 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100 shadow-[0_0_40px_rgba(34,211,238,0.12)] backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.9)]" />
              No-show enforcement validation
            </div>

            <h1 className="max-w-2xl text-balance text-3xl font-semibold leading-tight text-white sm:text-4xl">
              Never chase another no-show again.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Automatically handle missed appointments, cancellation fees, and awkward client conversations while
              keeping full control over exceptions.
            </p>

            <a
              href="#early-access"
              className="mt-9 inline-flex rounded-2xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-lime-200 px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_18px_60px_rgba(45,212,191,0.28)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_70px_rgba(45,212,191,0.38)]"
            >
              Join Early Access
            </a>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-5 shadow-2xl backdrop-blur sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">Control layer</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Automatic enforcement. Human override.</h2>
              </div>
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-cyan-300 to-emerald-300 shadow-[0_0_35px_rgba(45,212,191,0.35)]" />
            </div>
            <p className="text-sm leading-6 text-slate-300">
              The platform secures the fee automatically but allows the business owner a grace period to forgive genuine
              emergencies.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-950">
              {businessChoices.map((choice) => (
                <div key={choice} className="rounded-xl bg-white px-3 py-3">
                  {choice}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-12">
          <div className="mb-6 max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">The problem</p>
            <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">Missed appointments cost more than the fee.</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {problemPoints.map((point) => (
              <div key={point} className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 shadow-2xl backdrop-blur">
                <div className="mb-4 h-1.5 w-10 rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" />
                <p className="text-sm leading-6 text-slate-300">{point}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-12">
          <div className="grid gap-4 lg:grid-cols-3">
            {[
              'Client books normally',
              'System detects no-shows automatically',
              'Business chooses the right outcome',
            ].map((step, index) => (
              <div key={step} className="rounded-2xl border border-white/10 bg-white/[0.055] p-6 shadow-2xl backdrop-blur">
                <div className="mb-5 flex h-9 w-9 items-center justify-center rounded-full bg-cyan-300 text-sm font-bold text-slate-950">
                  {index + 1}
                </div>
                <h2 className="text-lg font-semibold text-white">{step}</h2>
                {index === 2 ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {businessChoices.map((choice) => (
                      <span key={choice} className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-xs text-slate-200">
                        {choice}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-slate-400">
                    Keep the normal booking flow intact while enforcement runs quietly in the background.
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="py-12">
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-6 shadow-2xl backdrop-blur sm:p-8">
            <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">Built for appointment businesses</p>
                <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">Automatic enforcement. Human override.</h2>
                <p className="mt-5 text-sm leading-6 text-slate-300 sm:text-base">
                  Secure cancellation commitments without losing the discretion to waive fees when a real emergency
                  deserves a softer response.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {industries.map((industry) => (
                  <div key={industry} className="rounded-xl border border-white/10 bg-[#05070d]/55 px-4 py-3 text-sm font-medium text-slate-200">
                    {industry}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="early-access" className="py-12 pb-20">
          <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">Early access</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">Register interest</h2>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium text-slate-200">
                Name
                <input
                  className="rounded-xl border border-white/15 bg-[#05070d]/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-200">
                Email
                <input
                  className="rounded-xl border border-white/15 bg-[#05070d]/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-200">
                Business Type
                <input
                  className="rounded-xl border border-white/15 bg-[#05070d]/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
                  name="businessType"
                  type="text"
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-200">
                Biggest cancellation/no-show problem
                <textarea
                  className="min-h-28 rounded-xl border border-white/15 bg-[#05070d]/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
                  name="biggestProblem"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 rounded-2xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-lime-200 px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_18px_60px_rgba(45,212,191,0.24)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_70px_rgba(45,212,191,0.34)]"
              >
                {submitting ? 'Joining...' : 'Join Early Access'}
              </button>

              {submitted ? (
                <p className="rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-sm font-medium text-emerald-100">
                  {"Thanks \u2014 you're on the early access list."}
                </p>
              ) : null}

              {errorMessage ? (
                <p className="rounded-xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm font-medium text-rose-100">
                  {errorMessage}
                </p>
              ) : null}
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
