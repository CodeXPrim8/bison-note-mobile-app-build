'use client'

import { useEffect, useState } from 'react'
import { WALLET_PULSE_EVENT } from '@/components/account-store'

export const BU_ALERT_NEON_EVENT = 'bu-alert-neon'

/** Tiny Dynamic-Island / notch neon — mobile only, alert moments only. */
export function fireAlertNeon() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(BU_ALERT_NEON_EVENT))
}

export function NotchAlert() {
  const [on, setOn] = useState(false)
  const [key, setKey] = useState(0)

  useEffect(() => {
    function light() {
      setOn(true)
      setKey((n) => n + 1)
    }
    function onPulse(event: Event) {
      const detail = (event as CustomEvent<{ delta?: number }>).detail
      if (typeof detail?.delta === 'number' && detail.delta > 0.005) light()
    }
    window.addEventListener(BU_ALERT_NEON_EVENT, light)
    window.addEventListener(WALLET_PULSE_EVENT, onPulse as EventListener)
    return () => {
      window.removeEventListener(BU_ALERT_NEON_EVENT, light)
      window.removeEventListener(WALLET_PULSE_EVENT, onPulse as EventListener)
    }
  }, [])

  useEffect(() => {
    if (!on) return
    const timer = window.setTimeout(() => setOn(false), 4200)
    return () => window.clearTimeout(timer)
  }, [on, key])

  if (!on) return null

  return (
    <div key={key} className="bu-notch-neon" aria-hidden>
      <span className="bu-notch-neon__pill" />
      <span className="bu-notch-neon__glow" />
    </div>
  )
}
