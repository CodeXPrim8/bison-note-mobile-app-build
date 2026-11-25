'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronLeft, CreditCard, Lock, Nfc, Wallet } from 'lucide-react'

type WaitlistState = {
  joined: boolean
  created_at: string | null
}

export default function BucksCard({ onBack }: { onBack?: () => void }) {
  const [state, setState] = useState<WaitlistState | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/card/waitlist', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) {
          setMessage(json.message || 'Could not load card waitlist')
          return
        }
        setState({
          joined: Boolean(json.data?.joined),
          created_at: json.data?.created_at ?? null,
        })
      })
      .catch(() => setMessage('Could not load card waitlist'))
  }, [])

  async function joinWaitlist() {
    if (busy || state?.joined) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/card/waitlist', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'bucks-card' }),
      })
      const json = await res.json()
      if (!json.status) {
        setMessage(json.message || 'Could not join waitlist')
        return
      }
      setState({
        joined: true,
        created_at: json.data?.created_at ?? new Date().toISOString(),
      })
      setMessage(json.message || 'You’re on the list')
    } catch {
      setMessage('Could not join waitlist')
    } finally {
      setBusy(false)
    }
  }

  const brandGradient = 'linear-gradient(135deg, #2f7bff 0%, #8b5cf6 52%, #ff2d95 100%)'
  const joined = Boolean(state?.joined)

  return (
    <div className="space-y-4 bg-transparent px-4 pb-28 pt-4 text-neutral-950">
      <div className="flex items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="bu-press flex h-10 w-10 items-center justify-center rounded-full bu-glass-soft"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : null}
        <div>
          <h1 className="text-lg font-bold">Ƀucks Card</h1>
          <p className="text-xs text-neutral-500">NFC + EMV contactless</p>
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-[30px] p-5 text-white"
        style={{
          background: brandGradient,
          boxShadow:
            '0 20px 44px rgba(47,123,255,0.32), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.08)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.75), transparent)',
          }}
        />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Ƀucks</p>
            <p className="mt-6 font-mono text-lg tracking-[0.2em] text-white/90">•••• •••• •••• ••••</p>
            <p className="mt-4 text-sm font-semibold">Tap. Pay. From your ɃU balance.</p>
          </div>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <Nfc className="h-6 w-6" />
          </span>
        </div>
        <div className="mt-6 flex items-center justify-between text-xs text-white/80">
          <span>EMV contactless</span>
          <span className="rounded-full bg-white/15 px-2.5 py-1 font-semibold uppercase tracking-wide">
            Coming soon
          </span>
        </div>
      </div>

      <div className="bu-glass-soft rounded-2xl p-4">
        <p className="text-sm text-neutral-600">
          A physical contactless card you tap at any NFC POS. Spend comes from your Ƀucks wallet — same balance you
          fund today.
        </p>
      </div>

      <div className="space-y-2">
        {[
          { Icon: Nfc, title: 'NFC + EMV', desc: 'Tap on contactless terminals — chip-grade security' },
          { Icon: Wallet, title: 'Linked to wallet', desc: 'Pays from your ɃU balance, not a separate float' },
          { Icon: Lock, title: 'Freeze in app', desc: 'Lock or replace the card from Ƀucks when live' },
        ].map(({ Icon, title, desc }) => (
          <div key={title} className="bu-glass-soft flex items-start gap-3 rounded-2xl p-4">
            <span className="bu-well-navy flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
              <Icon className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <h3 className="font-bold text-neutral-950">{title}</h3>
              <p className="mt-0.5 text-xs text-neutral-500">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={busy || joined || state === null}
        onClick={() => void joinWaitlist()}
        className={`bu-press flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-70 ${
          joined ? 'bg-neutral-900' : ''
        }`}
        style={joined ? undefined : { background: brandGradient }}
      >
        {joined ? (
          <>
            <Check className="h-4 w-4" />
            You’re on the list
          </>
        ) : busy ? (
          'Joining…'
        ) : (
          <>
            <CreditCard className="h-4 w-4" />
            Join waitlist
          </>
        )}
      </button>

      {message ? <p className="text-center text-xs text-neutral-500">{message}</p> : null}

      <p className="text-center text-[11px] leading-relaxed text-neutral-400">
        Tap to Pay on merchant phones is a separate feature and will come later. This waitlist is for the customer
        Ƀucks Card only.
      </p>
    </div>
  )
}
