'use client'

import { X } from 'lucide-react'
import { SEASON_COPY } from '@/lib/season'

export function LockGiftComingSoon({
  open,
  onClose,
  onSendBu,
}: {
  open: boolean
  onClose: () => void
  onSendBu?: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center px-4 pb-8 pt-16 sm:items-center sm:pb-0">
      <div className="absolute inset-0 bg-[color:var(--bu-navy-deep)]/65 backdrop-blur-[10px]" onClick={onClose} aria-hidden />
      <div className="bu-season-popup relative w-full max-w-[380px] overflow-hidden rounded-[30px]">
        <div className="bu-season-popup-shimmer" aria-hidden />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--bu-navy)]/45 text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="bu-season-popup-hero relative px-5 pb-4 pt-11">
          <div className="bu-season-popup-art mx-auto flex aspect-[4/3] w-full max-w-[220px] items-center justify-center rounded-[18px]">
            <div className="bu-clay-ticket !static !translate-x-0">
              <span className="bu-clay-ticket-mark">Ƀ</span>
              <span className="bu-clay-ticket-meta">VOUCHER</span>
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-amber-200/95">Coming soon</p>
        </div>
        <div className="relative space-y-4 px-5 pb-5 pt-4">
          <h2 className="text-[22px] font-bold leading-tight text-[color:var(--bu-navy)]">{SEASON_COPY.lockSoonTitle}</h2>
          <p className="text-sm leading-relaxed text-[color:var(--bu-navy-mid)]/85">{SEASON_COPY.lockSoonBody}</p>
          <div className="flex flex-col gap-2">
            {onSendBu ? (
              <button
                type="button"
                className="bu-press rounded-full bg-[color:var(--bu-navy)] px-4 py-3 text-sm font-semibold text-white"
                onClick={() => {
                  onClose()
                  onSendBu()
                }}
              >
                {SEASON_COPY.lockSoonCta}
              </button>
            ) : null}
            <button
              type="button"
              className="bu-press rounded-full border border-[color:var(--bu-navy)]/15 px-4 py-3 text-sm font-semibold text-[color:var(--bu-navy)]"
              onClick={onClose}
            >
              {SEASON_COPY.lockSoonDismiss}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
