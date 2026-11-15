'use client'

import { useCallback, useEffect, useState } from 'react'
import { Mail } from 'lucide-react'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Blocks the signed-in app until the account has a real contact email. */
export default function RequireEmailGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [needsEmail, setNeedsEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const check = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'include', cache: 'no-store' })
      const json = await res.json()
      if (!json.status || !json.data?.user) {
        setNeedsEmail(false)
        setReady(true)
        return
      }
      const contact =
        (typeof json.data?.profile?.email === 'string' && json.data.profile.email) ||
        (typeof json.data?.user?.email === 'string' && json.data.user.email) ||
        ''
      const missing = !contact.trim()
      setNeedsEmail(missing)
      if (!missing) setEmail(contact)
      setReady(true)
    } catch {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  async function save() {
    const value = email.trim().toLowerCase()
    if (!EMAIL_RE.test(value)) {
      setError(true)
      setMessage('Enter a real email. Every ɃU account needs one for Paystack, receipts, and PIN reset.')
      return
    }
    setBusy(true)
    setMessage(null)
    setError(false)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      })
      const json = await res.json()
      setBusy(false)
      if (!json.status) {
        setError(true)
        setMessage(json.message ?? 'Could not save email')
        return
      }
      setNeedsEmail(false)
      setMessage('Email saved')
    } catch {
      setBusy(false)
      setError(true)
      setMessage('Could not reach ɃU. Try again.')
    }
  }

  if (!ready) return <>{children}</>
  if (!needsEmail) return <>{children}</>

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#07101f]/55 px-4 pb-8 pt-16 backdrop-blur-sm sm:items-center sm:pb-0">
      <div className="w-full max-w-md rounded-3xl border border-white/70 bg-white/95 p-5 shadow-[0_24px_80px_rgba(7,16,31,0.35)]">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1f5fd6]/12 text-[#1f5fd6]">
          <Mail className="h-5 w-5" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-[#07101f]">Add your email</h2>
        <p className="mt-2 text-sm font-medium text-[#0b1733]/75">
          Every ɃU account needs a real email for Paystack, receipts, and Forgot PIN. You cannot remove it later.
        </p>
        <label className="mt-4 flex items-center gap-2 rounded-2xl border border-[#0b1733]/12 bg-[#f4f7fb] px-3 py-3">
          <Mail className="h-4 w-4 shrink-0 text-[#1f5fd6]" />
          <input
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-transparent text-sm font-medium text-[#07101f] outline-none placeholder:text-[#0b1733]/40"
          />
        </label>
        {message && (
          <p className={`mt-3 text-sm ${error ? 'text-red-600' : 'text-[#0b1733]/70'}`}>{message}</p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="mt-4 w-full rounded-2xl bg-[#1f5fd6] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save email & continue'}
        </button>
      </div>
    </div>
  )
}
