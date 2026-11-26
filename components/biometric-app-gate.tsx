'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScanFace } from 'lucide-react'
import {
  clearAppUnlocked,
  getBiometricAvailability,
  isAppUnlocked,
  isFaceUnlockPreferred,
  loadBiometricCredentials,
  markAppUnlocked,
  type BiometricAvailability,
} from '@/lib/auth/biometric'
import { PinPadModal } from '@/components/pin-pad-modal'

/**
 * Soft app lock when face unlock is enabled.
 * Biometric failure never traps the user — PIN always unlocks the session gate.
 */
export function BiometricAppGate({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [availability, setAvailability] = useState<BiometricAvailability | null>(null)

  const evaluate = useCallback(async () => {
    if (!isFaceUnlockPreferred()) {
      setLocked(false)
      return
    }
    const avail = await getBiometricAvailability()
    setAvailability(avail)
    if (!avail.available || !avail.native) {
      // Prefer not to trap users if biometrics vanished — keep session open.
      markAppUnlocked()
      setLocked(false)
      return
    }
    if (isAppUnlocked()) {
      setLocked(false)
      return
    }
    setLocked(true)
  }, [])

  useEffect(() => {
    void evaluate()
  }, [evaluate])

  useEffect(() => {
    let remove: (() => void) | undefined
    let cancelled = false

    void (async () => {
      try {
        const core = await import('@capacitor/core')
        if (!core.Capacitor.isNativePlatform()) return
        const { App } = await import('@capacitor/app')
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            if (isFaceUnlockPreferred()) clearAppUnlocked()
            return
          }
          void evaluate()
        })
        if (cancelled) {
          void handle.remove()
          return
        }
        remove = () => {
          void handle.remove()
        }
      } catch {
        // Browser / plugin missing — no resume lock.
      }
    })()

    return () => {
      cancelled = true
      remove?.()
    }
  }, [evaluate])

  async function unlockWithFace() {
    setBusy(true)
    setHint(null)
    const result = await loadBiometricCredentials('Unlock Ƀucks')
    setBusy(false)
    if (result.ok) {
      markAppUnlocked()
      setLocked(false)
      setPinOpen(false)
      setPinError(null)
      return
    }
    if (!result.cancelled) setHint(result.message || 'Use your PIN to continue.')
    setPinOpen(true)
  }

  async function unlockWithPin(pin: string) {
    // Local session gate only — the bu_session cookie already authenticates APIs.
    // Never re-prompt Face ID here; PIN must always clear a stuck biometric miss.
    if (!/^\d{4,6}$/.test(pin)) {
      setPinError('Enter your 4–6 digit PIN.')
      return
    }
    setBusy(true)
    setPinError(null)
    markAppUnlocked()
    setBusy(false)
    setLocked(false)
    setPinOpen(false)
  }

  useEffect(() => {
    if (!locked) return
    // Auto-prompt face once when the gate appears; never block if it fails.
    void unlockWithFace()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked])

  if (!locked) return <>{children}</>

  const label = availability?.label || 'Face unlock'

  return (
    <>
      <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-[color:var(--bu-navy-deep,#07101f)] px-6 text-white">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
          <ScanFace className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-xl font-bold tracking-tight">Unlock Ƀucks</h2>
        <p className="mt-2 max-w-xs text-center text-sm text-white/70">
          Use {label.toLowerCase()} to open your wallet. Your PIN always works if face unlock misses.
        </p>
        {hint ? <p className="mt-3 max-w-xs text-center text-sm text-amber-200">{hint}</p> : null}
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void unlockWithFace()}
            className="bu-press rounded-full bg-gradient-to-r from-[#2f7bff] to-[#8b5cf6] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Checking…' : `Try ${label}`}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setPinError(null)
              setPinOpen(true)
            }}
            className="bu-press rounded-full border border-white/25 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            Use PIN instead
          </button>
        </div>
      </div>
      <PinPadModal
        open={pinOpen}
        title="Enter PIN"
        subtitle="Unlock this device session. Face unlock stays optional."
        busy={busy}
        error={pinError}
        onClose={() => {
          if (!busy) setPinOpen(false)
        }}
        onSubmit={(pin) => void unlockWithPin(pin)}
        biometric={false}
      />
    </>
  )
}
