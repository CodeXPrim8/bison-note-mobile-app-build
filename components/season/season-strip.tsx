'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { SEASON_COPY, SEASON_STRIP_KEY, shouldShowSeason } from '@/lib/season'
import { LockGiftComingSoon } from '@/components/season/lock-gift-coming-soon'

export function SeasonStrip({ className = '' }: { className?: string }) {
  const [show, setShow] = useState(false)
  const [lockOpen, setLockOpen] = useState(false)

  useEffect(() => {
    if (!shouldShowSeason()) return
    if (window.localStorage.getItem(SEASON_STRIP_KEY) === '1') return
    setShow(true)
  }, [])

  if (!show) return null

  return (
    <>
      <div className={`bu-season-strip ${className}`.trim()} role="region" aria-label="Season of love">
        <div className="bu-season-strip-ribbon" aria-hidden />
        <div className="bu-season-strip-inner">
          <p className="bu-season-strip-eyebrow">{SEASON_COPY.eyebrow}</p>
          <p className="bu-season-strip-text">{SEASON_COPY.strip}</p>
          <button type="button" className="bu-season-lock-chip" onClick={() => setLockOpen(true)}>
            {SEASON_COPY.stripLockChip}
          </button>
        </div>
        <button
          type="button"
          className="bu-season-strip-close"
          aria-label="Dismiss"
          onClick={() => {
            window.localStorage.setItem(SEASON_STRIP_KEY, '1')
            setShow(false)
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <LockGiftComingSoon open={lockOpen} onClose={() => setLockOpen(false)} />
    </>
  )
}
