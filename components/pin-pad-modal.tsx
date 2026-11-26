'use client'

import { useEffect, useState } from 'react'
import { Delete, ScanFace, X } from 'lucide-react'
import {
  getBiometricAvailability,
  isFaceUnlockPreferred,
  loadBiometricCredentials,
  type BiometricAvailability,
} from '@/lib/auth/biometric'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const

export function PinPadModal({
  open,
  title = 'Enter transaction PIN',
  subtitle = '',
  busy = false,
  error = null,
  onClose,
  onSubmit,
  biometric = true,
}: {
  open: boolean
  title?: string
  subtitle?: string
  busy?: boolean
  error?: string | null
  onClose: () => void
  onSubmit: (pin: string) => void | Promise<void>
  /** Offer face / fingerprint when enabled (default true). */
  biometric?: boolean
}) {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const [faceBusy, setFaceBusy] = useState(false)
  const [faceHint, setFaceHint] = useState<string | null>(null)
  const [availability, setAvailability] = useState<BiometricAvailability | null>(null)

  useEffect(() => {
    if (!open) {
      setPin('')
      setShake(false)
      setFaceBusy(false)
      setFaceHint(null)
      return
    }
    if (!biometric || !isFaceUnlockPreferred()) {
      setAvailability(null)
      return
    }
    let cancelled = false
    void getBiometricAvailability().then((result) => {
      if (!cancelled) setAvailability(result)
    })
    return () => {
      cancelled = true
    }
  }, [open, biometric])

  useEffect(() => {
    if (!error) return
    setShake(true)
    setPin('')
    const timer = window.setTimeout(() => setShake(false), 420)
    return () => window.clearTimeout(timer)
  }, [error])

  if (!open) return null

  const showFace = Boolean(biometric && isFaceUnlockPreferred() && availability?.available)

  function press(key: (typeof KEYS)[number]) {
    if (busy || faceBusy) return
    if (key === '') return
    if (key === 'del') {
      setPin((value) => value.slice(0, -1))
      return
    }
    setPin((value) => (value.length >= 6 ? value : `${value}${key}`))
  }

  async function confirm() {
    if (busy || faceBusy || pin.length < 4) return
    await onSubmit(pin)
  }

  async function unlockWithFace() {
    if (busy || faceBusy) return
    setFaceBusy(true)
    setFaceHint(null)
    const result = await loadBiometricCredentials('Confirm transaction')
    setFaceBusy(false)
    if (result.ok) {
      await onSubmit(result.pin)
      return
    }
    if (!result.cancelled) {
      setFaceHint(result.message || 'Use your PIN instead.')
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close PIN pad"
        className="bu-pin-backdrop absolute inset-0 bg-black/55"
        onClick={() => {
          if (!busy && !faceBusy) onClose()
        }}
      />
      <div className="bu-pin-sheet bu-glass relative z-10 w-full max-w-md rounded-t-[28px] px-5 pb-8 pt-4 text-neutral-950 sm:rounded-[28px] sm:pb-6">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-200 sm:hidden" />
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
            {subtitle ? <p className="mt-1 text-sm text-neutral-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!busy && !faceBusy) onClose()
            }}
            className="rounded-full bg-neutral-100 p-2 text-neutral-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={`mb-6 flex justify-center gap-3 ${shake ? 'bu-pin-shake' : ''}`}>
          {Array.from({ length: 6 }).map((_, index) => {
            const filled = index < pin.length
            const active = index === pin.length && pin.length < 6
            return (
              <span
                key={index}
                className={`h-3.5 w-3.5 rounded-full transition-all duration-200 ${
                  filled
                    ? 'scale-110 bg-neutral-950'
                    : active
                      ? 'bg-neutral-300 ring-2 ring-neutral-950/20'
                      : 'bg-neutral-200'
                }`}
              />
            )
          })}
        </div>

        {error ? <p className="mb-4 text-center text-sm text-destructive">{error}</p> : null}
        {faceHint ? <p className="mb-4 text-center text-sm text-amber-700">{faceHint}</p> : null}

        {showFace ? (
          <button
            type="button"
            disabled={busy || faceBusy}
            onClick={() => void unlockWithFace()}
            className="bu-press mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white py-3 text-sm font-semibold text-neutral-950 disabled:opacity-50"
          >
            <ScanFace className="h-4 w-4" />
            {faceBusy ? 'Checking…' : `Use ${availability?.label || 'Face unlock'}`}
          </button>
        ) : null}

        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((key, index) => {
            if (key === '') return <div key={`spacer-${index}`} />
            return (
              <button
                key={key}
                type="button"
                disabled={busy || faceBusy}
                onClick={() => press(key)}
                className="bu-press flex h-14 items-center justify-center rounded-2xl bg-neutral-100 text-xl font-semibold text-neutral-950 transition hover:bg-neutral-200 disabled:opacity-50"
              >
                {key === 'del' ? <Delete className="h-5 w-5" /> : key}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          disabled={busy || faceBusy || pin.length < 4}
          onClick={() => void confirm()}
          className="bu-press mt-5 w-full rounded-2xl bg-neutral-950 py-3.5 text-sm font-semibold text-white transition disabled:opacity-40"
        >
          {busy || faceBusy ? 'Checking…' : 'Confirm PIN'}
        </button>
      </div>
    </div>
  )
}
