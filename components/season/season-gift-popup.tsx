'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import {
  SEASON_COPY,
  SEASON_POPUP_INTERVAL_MS,
  SEASON_POPUP_KEY,
  shouldShowSeason,
  wasReferPopupShownRecently,
} from '@/lib/season'
import { LockGiftComingSoon } from '@/components/season/lock-gift-coming-soon'

export function SeasonGiftPopup({
  mode,
  onSendBu,
  onFund,
}: {
  mode: 'guest' | 'member'
  onSendBu?: () => void
  onFund?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [lockOpen, setLockOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!shouldShowSeason()) return
    const last = Number(window.localStorage.getItem(SEASON_POPUP_KEY) || 0)
    if (Number.isFinite(last) && last > 0 && Date.now() - last < SEASON_POPUP_INTERVAL_MS) return
    const timer = window.setTimeout(() => {
      if (cancelled) return
      if (mode === 'member' && wasReferPopupShownRecently()) return
      setOpen(true)
      window.localStorage.setItem(SEASON_POPUP_KEY, String(Date.now()))
    }, mode === 'guest' ? 2200 : 3200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [mode])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-end justify-center px-4 pb-8 pt-16 sm:items-center sm:pb-0">
        <div className="absolute inset-0 bg-[color:var(--bu-navy-deep)]/60 backdrop-blur-[10px]" onClick={() => setOpen(false)} aria-hidden />
        <div className="bu-season-popup bu-season-popup-enter relative w-full max-w-[380px] overflow-hidden rounded-[30px]">
          <div className="bu-season-popup-shimmer" aria-hidden />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--bu-navy)]/45 text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="bu-season-popup-hero relative px-5 pb-3 pt-11">
            <div className="bu-season-popup-art mx-auto flex aspect-[4/3] w-full max-w-[240px] items-center justify-center gap-4 rounded-[18px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/season/snowflake-cut.png" alt="" className="h-14 w-auto drop-shadow-lg" />
              <div className="bu-clay-ticket !static !translate-x-0 !rotate-[-6deg]">
                <span className="bu-clay-ticket-mark">Ƀ</span>
                <span className="bu-clay-ticket-meta">VOUCHER</span>
              </div>
            </div>
            <p className="mt-3 text-center text-[12px] font-semibold tracking-wide text-amber-100/95">{SEASON_COPY.eyebrow}</p>
          </div>
          <div className="relative space-y-4 px-5 pb-5 pt-4">
            <h2 className="text-[22px] font-bold leading-tight text-[color:var(--bu-navy)]">
              {mode === 'guest' ? SEASON_COPY.guestTitle : SEASON_COPY.memberTitle}
            </h2>
            <p className="text-sm leading-relaxed text-[color:var(--bu-navy-mid)]/85">
              {mode === 'guest' ? SEASON_COPY.guestBody : SEASON_COPY.memberBody}
            </p>
            <div className="flex flex-col gap-2">
              {mode === 'guest' ? (
                <>
                  <Link
                    href="/login?mode=signup"
                    className="bu-press block rounded-full bg-[color:var(--bu-navy)] px-4 py-3 text-center text-sm font-semibold text-white"
                    onClick={() => setOpen(false)}
                  >
                    {SEASON_COPY.guestCta}
                  </Link>
                  <Link href="/login" className="block text-center text-sm font-medium text-[color:var(--bu-cyber)]" onClick={() => setOpen(false)}>
                    {SEASON_COPY.guestSignIn}
                  </Link>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="bu-press rounded-full bg-[color:var(--bu-navy)] px-4 py-3 text-sm font-semibold text-white"
                    onClick={() => {
                      setOpen(false)
                      onSendBu?.()
                    }}
                  >
                    {SEASON_COPY.memberCtaSend}
                  </button>
                  <button
                    type="button"
                    className="bu-press rounded-full border border-[color:var(--bu-navy)]/15 px-4 py-3 text-sm font-semibold text-[color:var(--bu-navy)]"
                    onClick={() => {
                      setOpen(false)
                      onFund?.()
                    }}
                  >
                    {SEASON_COPY.memberCtaFund}
                  </button>
                </>
              )}
              <button type="button" className="bu-season-lock-chip mx-auto" onClick={() => setLockOpen(true)}>
                {SEASON_COPY.lockChip}
              </button>
            </div>
          </div>
        </div>
      </div>
      <LockGiftComingSoon
        open={lockOpen}
        onClose={() => setLockOpen(false)}
        onSendBu={
          mode === 'member'
            ? () => {
                setLockOpen(false)
                setOpen(false)
                onSendBu?.()
              }
            : undefined
        }
      />
    </>
  )
}
