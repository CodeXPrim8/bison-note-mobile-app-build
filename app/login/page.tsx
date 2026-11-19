'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, Mail, Phone, User } from 'lucide-react'
import { safeNextPath } from '@/lib/auth/paths'
import { loadDraft, saveDraft } from '@/lib/forms/draft'
import { clearAccountSnapshots } from '@/lib/session-snapshot'

const LOGIN_DRAFT_KEY = 'bu-login-draft'

type Mode = 'login' | 'signup' | 'forgot' | 'reset'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [challenge, setChallenge] = useState<string | null>(null)
  const [emailHint, setEmailHint] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('login')
  const [message, setMessage] = useState<string | null>(null)
  const [messageOk, setMessageOk] = useState(false)
  const [nextPath, setNextPath] = useState('/app')
  const [busy, setBusy] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [referralCode, setReferralCode] = useState('')
  const [referralLocked, setReferralLocked] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const next = safeNextPath(params.get('next'))
    setNextPath(next)
    if (params.get('forgot') === '1') setMode('forgot')
    if (params.get('mode') === 'signup') setMode('signup')
    const ref =
      String(params.get('ref') || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 12) ||
      String(window.sessionStorage.getItem('bu_referral_code') || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 12)
    if (ref) {
      setReferralCode(ref)
      setReferralLocked(true)
      window.sessionStorage.setItem('bu_referral_code', ref)
      if (params.get('mode') !== 'login') setMode('signup')
    }
    const draft = loadDraft<{ phone?: string; name?: string; email?: string }>(LOGIN_DRAFT_KEY)
    if (draft?.phone) setPhone(draft.phone)
    if (draft?.name) setName(draft.name)
    if (draft?.email) setEmail(draft.email)
    setDraftReady(true)
  }, [])

  useEffect(() => {
    if (!draftReady) return
    saveDraft(LOGIN_DRAFT_KEY, { phone, name, email })
  }, [draftReady, phone, name, email, mode])

  function switchMode(next: Mode) {
    setMode(next)
    setMessage(null)
    setMessageOk(false)
    setPin('')
    setConfirmPin('')
    setOtp('')
    setShowPin(false)
    setShowConfirm(false)
    if (next !== 'reset') {
      setChallenge(null)
      setEmailHint(null)
    }
  }

  function showError(text: string) {
    setMessageOk(false)
    setMessage(text)
  }

  function showInfo(text: string) {
    setMessageOk(true)
    setMessage(text)
  }

  async function submitLoginOrSignup() {
    if (mode === 'signup') {
      if (!name.trim()) {
        setMessage('Enter your name.')
        return
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setMessage('Enter your email. It is used for receipts and account recovery, and it cannot be shared with another account.')
        return
      }
      if (!phone.trim()) {
        setMessage('Phone number is required. It is your ɃU ID.')
        return
      }
      if (!/^\d{4,6}$/.test(pin)) {
        setMessage('PIN must be 4–6 digits.')
        return
      }
      if (pin !== confirmPin) {
        setMessage('PINs do not match.')
        return
      }
    } else if (!phone.trim()) {
      setMessage('Enter your phone number.')
      return
    } else if (!/^\d{4,6}$/.test(pin)) {
      setMessage('PIN must be 4–6 digits.')
      return
    }

    setBusy(true)
    setMessage(null)
    const path = mode === 'login' ? '/api/auth/login' : '/api/auth/signup'
    try {
      const res = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'login'
            ? { pin, phone }
            : {
                display_name: name,
                phone,
                pin,
                email: email.trim(),
                role: 'guest',
                referral_code: referralCode.trim() || undefined,
              },
        ),
      })
      const json = (await res.json()) as { status: boolean; message: string; code?: string }
      setBusy(false)
      if (json.code === 'EMAIL_TAKEN') {
        setMessage('This email is already on another account. Use your own email.')
        return
      }
      if (json.code === 'BU_ID_TAKEN' || /already registered/i.test(json.message || '')) {
        switchMode('login')
        setMessage('This ɃU ID is already registered. Log in with your PIN.')
        return
      }
      setMessage(json.message || (res.ok ? 'Signed in' : 'Could not sign in'))
      if (json.status) {
        clearAccountSnapshots()
        window.location.assign(nextPath)
      }
    } catch {
      setBusy(false)
      setMessage('Could not reach ɃU. Check that the server is running, then try again.')
    }
  }

  async function submitForgot() {
    if (!phone.trim()) {
      setMessage('Enter your phone number (ɃU ID).')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/auth/forgot-pin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      })
      const json = (await res.json()) as {
        status: boolean
        message: string
        data?: {
          challenge?: string | null
          email_hint?: string | null
          message?: string
        }
      }
      setBusy(false)
      if (!json.status) {
        showError(json.message || 'Could not start PIN reset')
        return
      }
      const nextChallenge = json.data?.challenge || null
      setChallenge(nextChallenge)
      setEmailHint(json.data?.email_hint || null)
      setOtp('')
      showInfo(json.data?.message || json.message || 'Check your email for a reset code.')
      if (nextChallenge) setMode('reset')
    } catch {
      setBusy(false)
      showError('Could not reach ɃU. Try again in a moment.')
    }
  }

  async function submitReset() {
    if (!challenge) {
      showError('Request a new reset code first.')
      switchMode('forgot')
      return
    }
    if (!/^\d{6}$/.test(otp)) {
      showError('Enter the 6-digit code from your email.')
      return
    }
    if (!/^\d{4,6}$/.test(pin)) {
      showError('New PIN must be 4–6 digits.')
      return
    }
    if (pin !== confirmPin) {
      showError('New PINs do not match.')
      return
    }
    setBusy(true)
    setMessage(null)
    setMessageOk(false)
    try {
      const res = await fetch('/api/auth/reset-pin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge,
          otp,
          new_pin: pin,
          confirm_pin: confirmPin,
        }),
      })
      const json = (await res.json()) as { status: boolean; message: string; data?: { phone?: string } }
      setBusy(false)
      if (!json.status) {
        showError(json.message || 'Could not reset PIN')
        return
      }
      if (json.data?.phone) setPhone(json.data.phone)
      setChallenge(null)
      setEmailHint(null)
      setOtp('')
      setPin('')
      setConfirmPin('')
      setMode('login')
      showInfo(json.message || 'PIN updated. Log in with your new PIN.')
    } catch {
      setBusy(false)
      showError('Could not reach ɃU. Try again in a moment.')
    }
  }

  async function submit() {
    if (mode === 'forgot') return submitForgot()
    if (mode === 'reset') return submitReset()
    return submitLoginOrSignup()
  }

  const headline =
    mode === 'login'
      ? 'Welcome back'
      : mode === 'signup'
        ? 'Create account'
        : mode === 'forgot'
          ? 'Forgot PIN'
          : 'Set new PIN'

  const subtitle =
    mode === 'login'
      ? 'Sign in with your ɃU ID and PIN'
      : mode === 'signup'
        ? 'One wallet. Digital vouchers for celebration.'
        : mode === 'forgot'
          ? 'We will email a code to the address on your account'
          : emailHint
            ? `Code sent to ${emailHint}`
            : 'Enter the email code and choose a new PIN'

  const cta =
    busy
      ? 'Please wait…'
      : mode === 'login'
        ? 'Login'
        : mode === 'signup'
          ? 'Create account'
          : mode === 'forgot'
            ? 'Send reset code'
            : 'Update PIN'

  return (
    <div className="bu-auth-screen">
      <span className="bu-auth-watermark bu-auth-float" style={{ left: '6%', top: '12%', fontSize: '7.5rem' }}>
        Ƀ
      </span>
      <span
        className="bu-auth-watermark bu-auth-float-delay"
        style={{ right: '4%', bottom: '18%', fontSize: '5.5rem', transform: 'rotate(18deg)' }}
      >
        Ƀ
      </span>
      <span className="bu-auth-watermark" style={{ left: '42%', top: '58%', fontSize: '3.2rem', opacity: 0.7 }}>
        1:1
      </span>
      <div className="bu-auth-voucher bu-auth-float" style={{ width: 160, height: 96, left: '-2%', top: '62%' }} />
      <div
        className="bu-auth-voucher bu-auth-float-delay"
        style={{ width: 120, height: 72, right: '-1%', top: '28%', transform: 'rotate(16deg)' }}
      />

      <div className="relative z-[1] mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-10 pt-6">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="text-sm font-bold tracking-tight text-white">
            Ƀucks
          </Link>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e0dff5] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
            Digital voucher
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-center">
          <div className="bu-auth-panel">
            <div className="bu-auth-logo-well mb-5">
              <span className="bu-auth-mark-3d" aria-hidden>
                Ƀ
              </span>
            </div>

            <div className="mb-6 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#22e0ff]">
                Ƀucks
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">{headline}</h1>
              <p className="mt-2 text-sm font-medium text-[#e0dff5]/80">{subtitle}</p>
            </div>

            <form
              className="space-y-3.5"
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              {mode === 'signup' && (
                <label className="bu-auth-field">
                  <User className="h-4 w-4 shrink-0 text-[#22e0ff]" />
                  <input
                    placeholder="Full name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}

              {mode === 'signup' && (
                <label className="bu-auth-field">
                  <Mail className="h-4 w-4 shrink-0 text-[#22e0ff]" />
                  <input
                    type="email"
                    placeholder="Email for receipts"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              )}

              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <label className="bu-auth-field">
                    <User className="h-4 w-4 shrink-0 text-[#22e0ff]" />
                    <input
                      placeholder="Referral code (optional)"
                      value={referralCode}
                      readOnly={referralLocked}
                      onChange={(e) => {
                        if (referralLocked) return
                        setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))
                      }}
                      className={referralLocked ? 'opacity-80' : undefined}
                    />
                  </label>
                  {referralLocked ? (
                    <p className="px-1 text-xs font-medium text-[#22e0ff]/90">
                      Invite link applied — this code can’t be edited.
                    </p>
                  ) : null}
                </div>
              )}

              {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
                <label className="bu-auth-field">
                  <Phone className="h-4 w-4 shrink-0 text-[#22e0ff]" />
                  <input
                    placeholder="Phone / ɃU ID"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
              )}

              {mode === 'reset' && (
                <label className="bu-auth-field">
                  <KeyRound className="h-4 w-4 shrink-0 text-[#22e0ff]" />
                  <input
                    placeholder="6-digit email code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </label>
              )}

              {(mode === 'login' || mode === 'signup' || mode === 'reset') && (
                <label className="bu-auth-field">
                  <Lock className="h-4 w-4 shrink-0 text-[#22e0ff]" />
                  <input
                    placeholder={
                      mode === 'signup' ? 'Create 4–6 digit PIN' : mode === 'reset' ? 'New 4–6 digit PIN' : 'PIN'
                    }
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                  <button
                    type="button"
                    className="rounded-full p-1 text-[#e0dff5]/70"
                    aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                    onClick={() => setShowPin((v) => !v)}
                  >
                    {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </label>
              )}

              {(mode === 'signup' || mode === 'reset') && (
                <label className="bu-auth-field">
                  <Lock className="h-4 w-4 shrink-0 text-[#22e0ff]" />
                  <input
                    placeholder={mode === 'reset' ? 'Confirm new PIN' : 'Confirm PIN'}
                    type={showConfirm ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                  <button
                    type="button"
                    className="rounded-full p-1 text-[#e0dff5]/70"
                    aria-label={showConfirm ? 'Hide confirm PIN' : 'Show confirm PIN'}
                    onClick={() => setShowConfirm((v) => !v)}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </label>
              )}

              {mode === 'login' && (
                <div className="flex items-center justify-end px-1">
                  <button
                    type="button"
                    className="text-sm font-bold text-[#22e0ff]"
                    onClick={() => switchMode('forgot')}
                  >
                    Forgot PIN?
                  </button>
                </div>
              )}

              {message ? (
                <p className={`px-1 text-sm font-semibold ${messageOk ? 'text-[#e0dff5]/85' : 'text-red-300'}`}>
                  {message}
                </p>
              ) : null}

              <button type="submit" className="bu-auth-cta" disabled={busy}>
                <span>{cta}</span>
                <span className="bu-auth-cta-arrow" aria-hidden>
                  <ArrowRight className="h-4 w-4" />
                </span>
              </button>
            </form>

            <div className="mt-5 space-y-2 text-center">
              {(mode === 'forgot' || mode === 'reset') && (
                <button
                  type="button"
                  className="text-sm font-bold text-[#e0dff5]/90"
                  onClick={() => switchMode('login')}
                >
                  Back to login
                </button>
              )}
              {(mode === 'login' || mode === 'signup') && (
                <button
                  type="button"
                  className="text-sm font-bold text-[#e0dff5]/90"
                  onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                >
                  {mode === 'login' ? "Don't have an account? Create one" : 'Have an account? Login'}
                </button>
              )}
            </div>
          </div>

          <p className="mt-8 text-center text-[10px] font-bold uppercase tracking-[0.22em] text-[#e0dff5]/55">
            Celebrate · Send ɃU · Redeem
          </p>
        </div>
      </div>
    </div>
  )
}
