'use client'

import { Inter } from 'next/font/google'
import { useState, FormEvent } from 'react'

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '700'] })

// ── Brand tokens ──────────────────────────────────────────────────────────────
const INK = '#111111'
const INDIGO = '#4F46E5'
const INDIGO_DARK = '#4338CA'
const INDIGO_TINT = '#EEF2FF'
const OFF_WHITE = '#FAFAFA'
const SURFACE = '#F4F4F4'
const MUTED = '#6B7280'
const SUBTLE = '#9CA3AF'

// ── Wordmark ──────────────────────────────────────────────────────────────────
function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={className} style={{ fontWeight: 500, letterSpacing: '-0.03em' }}>
      <span style={{ fontWeight: 700 }}>T</span>rade
      <span style={{ fontWeight: 700 }}>B</span>ook
    </span>
  )
}

// ── Waitlist form ─────────────────────────────────────────────────────────────
type Status = 'idle' | 'loading' | 'success' | 'error'

function WaitlistForm() {
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!phone.trim()) return
    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus('success')
      } else {
        setStatus('error')
        setErrorMsg(data.error ?? 'Something went wrong.')
      }
    } catch {
      setStatus('error')
      setErrorMsg('Something went wrong. Please try again.')
    }
  }

  if (status === 'success') {
    return (
      <div
        className="rounded-xl px-5 py-4 text-sm font-medium"
        style={{ background: INDIGO_TINT, color: INDIGO }}
      >
        ✓ You&apos;re on the waitlist. We&apos;ll text you when we launch. 60 days free.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Your mobile number"
          required
          className="flex-1 rounded-lg border px-4 py-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent"
          style={{ background: '#FFFFFF', borderColor: '#D1D5DB', color: INK }}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="whitespace-nowrap rounded-lg px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#4338CA] disabled:opacity-70"
          style={{ background: INDIGO, letterSpacing: '-0.01em' }}
        >
          {status === 'loading' ? 'Adding you…' : 'Join the waitlist →'}
        </button>
      </div>
      {status === 'error' && (
        <p className="mt-2 text-sm text-red-500">{errorMsg}</p>
      )}
      <p className="mt-2 text-xs" style={{ color: SUBTLE }}>
        60 days free at launch · No card required
      </p>
    </form>
  )
}

// ── WhatsApp chat mockup ──────────────────────────────────────────────────────
function ChatMockup() {
  return (
    <div
      className="w-72 rounded-[28px] p-3 shadow-2xl"
      style={{ background: '#0F1724' }}
    >
      {/* Header */}
      <div
        className="mb-3 flex items-center gap-3 rounded-2xl px-3 py-2"
        style={{ background: '#16213E' }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: INDIGO }}
        >
          TB
        </div>
        <div>
          <p className="text-xs font-medium text-white">TradeBook</p>
          <p className="text-[10px]" style={{ color: '#4ADE80' }}>● online</p>
        </div>
      </div>

      {/* Messages */}
      <div className="space-y-2 px-1">
        <div className="flex justify-end">
          <div
            className="max-w-[185px] rounded-lg rounded-tr-none px-3 py-2 text-xs leading-relaxed"
            style={{ background: '#DCF8C6', color: INK }}
          >
            📷 Screwfix receipt
          </div>
        </div>

        <div className="flex justify-start">
          <div
            className="max-w-[215px] rounded-lg rounded-tl-none px-3 py-2 text-xs leading-relaxed shadow-sm"
            style={{ background: '#FFFFFF', color: INK }}
          >
            ✓ £83.50. Screwfix, materials, today. June total: £2,104.
          </div>
        </div>

        <div className="flex justify-end">
          <div
            className="max-w-[185px] rounded-lg rounded-tr-none px-3 py-2 text-xs leading-relaxed"
            style={{ background: '#DCF8C6', color: INK }}
          >
            what do I owe this quarter
          </div>
        </div>

        <div className="flex justify-start">
          <div
            className="max-w-[215px] rounded-lg rounded-tl-none px-3 py-2 text-xs leading-relaxed shadow-sm"
            style={{ background: '#FFFFFF', color: INK }}
          >
            Estimated tax this quarter: ~£1,840. Due 5 Aug. Want me to prepare it?
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div
        className="mt-3 flex items-center gap-2 rounded-full px-4 py-2"
        style={{ background: '#16213E' }}
      >
        <span className="flex-1 text-xs" style={{ color: '#4B5563' }}>Message</span>
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ background: INDIGO }}
        >
          ↑
        </div>
      </div>
    </div>
  )
}

// ── Pain card ─────────────────────────────────────────────────────────────────
function PainCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl p-6" style={{ background: SURFACE }}>
      <span className="mb-4 block text-3xl">{icon}</span>
      <h3 className="mb-2 text-base font-medium" style={{ color: INK, letterSpacing: '-0.02em' }}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
        {body}
      </p>
    </div>
  )
}

// ── How it works step ─────────────────────────────────────────────────────────
function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium text-white"
        style={{ background: INDIGO }}
      >
        {n}
      </div>
      <div>
        <h3 className="mb-1 text-base font-medium" style={{ color: INK, letterSpacing: '-0.02em' }}>
          {title}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
          {body}
        </p>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div
      className={`${inter.className} min-h-screen`}
      style={{ background: OFF_WHITE, color: INK }}
    >
      {/* Nav */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Wordmark className="text-xl" />
        <a
          href="#waitlist"
          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4338CA]"
          style={{ background: INDIGO, letterSpacing: '-0.01em' }}
        >
          Join waitlist
        </a>
      </nav>

      <main>
        {/* ── Hero ── */}
        <section className="mx-auto max-w-6xl px-6 pb-24 pt-16">
          <div className="flex flex-col items-center gap-14 lg:flex-row lg:items-center">

            {/* Copy + form */}
            <div className="flex-1 text-center lg:text-left">
              <div
                className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
                style={{ background: INDIGO_TINT, color: INDIGO }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: INDIGO }} />
                MTD ready · Launching 2026
              </div>

              <h1
                className="mb-5 text-5xl font-medium leading-[1.1] lg:text-6xl"
                style={{ letterSpacing: '-0.02em', color: INK }}
              >
                Text it.{' '}
                <span style={{ color: INDIGO }}>
                  Your <Wordmark /> handles it.
                </span>
              </h1>

              <p
                className="mx-auto mb-8 max-w-lg text-lg leading-relaxed lg:mx-0"
                style={{ color: MUTED }}
              >
                WhatsApp bookkeeping for UK tradespeople. Snap a receipt.
                Voice note an expense. Ask what you owe.
                Your TradeBook sorts it. MTD included.
              </p>

              <div id="waitlist" className="mx-auto max-w-md lg:mx-0">
                <WaitlistForm />
              </div>
            </div>

            {/* Chat mockup — desktop only */}
            <div className="hidden shrink-0 lg:block">
              <ChatMockup />
            </div>
          </div>
        </section>

        {/* ── Pain section ── */}
        <section className="py-20" style={{ background: '#FFFFFF' }}>
          <div className="mx-auto max-w-6xl px-6">
            <h2
              className="mb-12 text-center text-3xl font-medium"
              style={{ letterSpacing: '-0.02em', color: INK }}
            >
              Built for the way tradespeople actually work
            </h2>
            <div className="grid gap-5 sm:grid-cols-3">
              <PainCard
                icon="🧾"
                title="Stop losing receipts"
                body="Every receipt you forget = tax money you don't claim back. Snap it on your phone. TradeBook logs it instantly."
              />
              <PainCard
                icon="⚠️"
                title="HMRC is changing the rules"
                body="Making Tax Digital is mandatory from April 2026. Are you using compliant software? TradeBook does it for you."
              />
              <PainCard
                icon="💬"
                title="No apps. No forms. Just WhatsApp."
                body="You're already on WhatsApp. Your TradeBook lives there too. No new software to learn. No new habit to form."
              />
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="py-20" style={{ background: OFF_WHITE }}>
          <div className="mx-auto max-w-4xl px-6">
            <h2
              className="mb-12 text-center text-3xl font-medium"
              style={{ letterSpacing: '-0.02em', color: INK }}
            >
              Up and running in 30 seconds
            </h2>
            <div className="grid gap-10 sm:grid-cols-3">
              <Step
                n={1}
                title="Download TradeBook"
                body="Sign up and connect your WhatsApp number. Takes 30 seconds. No card required."
              />
              <Step
                n={2}
                title="Send anything"
                body="Receipt photos, voice notes, typed messages. TradeBook reads them all and logs every penny."
              />
              <Step
                n={3}
                title="Stay sorted"
                body="TradeBook tracks your running total, estimates your tax, and prepares your quarterly update for your approval."
              />
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section className="py-20" style={{ background: '#FFFFFF' }}>
          <div className="mx-auto max-w-sm px-6 text-center">
            <p className="mb-1 text-sm font-medium" style={{ color: INDIGO }}>Simple pricing</p>
            <h2
              className="mb-1 text-5xl font-medium"
              style={{ letterSpacing: '-0.02em', color: INK }}
            >
              £29
              <span className="text-2xl font-normal" style={{ color: MUTED }}>/mo</span>
            </h2>
            <p className="mb-8 text-sm" style={{ color: MUTED }}>
              Less than an hour of your time. Cancel anytime.
            </p>

            <ul className="mb-8 space-y-3 text-left text-sm" style={{ color: '#374151' }}>
              {[
                'WhatsApp receipt & expense capture',
                'Automatic bookkeeping',
                'MTD quarterly prep & submission',
                'Tax estimate always up to date',
                'Your data, always yours',
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span style={{ color: INDIGO }}>✓</span> {f}
                </li>
              ))}
            </ul>

            <a
              href="#waitlist"
              className="block w-full rounded-lg px-6 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-[#4338CA]"
              style={{ background: INDIGO, letterSpacing: '-0.01em' }}
            >
              Join the waitlist. Get 60 days free →
            </a>
            <p className="mt-3 text-xs" style={{ color: SUBTLE }}>
              No card required to join the waitlist.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-10" style={{ borderTop: `1px solid #E5E7EB`, background: OFF_WHITE }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
            <Wordmark className="text-base" />
            <p className="text-xs" style={{ color: SUBTLE }}>
              Built for UK tradespeople · MTD-compliant · UK GDPR compliant
            </p>
            <div className="flex gap-4 text-xs" style={{ color: SUBTLE }}>
              <a href="#" className="hover:underline">Privacy Policy</a>
              <a href="#" className="hover:underline">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
