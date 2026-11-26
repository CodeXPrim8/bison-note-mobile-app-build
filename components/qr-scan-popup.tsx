'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { TicketQrScanner } from '@/components/web/ticket-qr-scanner'

export function QrScanPopup({
  open,
  onClose,
  onScan,
  title = 'Scan QR',
  hint = 'Align the code inside the frame. It scans automatically.',
  readerId = 'bu-qr-popup',
}: {
  open: boolean
  onClose: () => void
  onScan: (raw: string) => void
  title?: string
  hint?: string
  readerId?: string
}) {
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close scanner"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-[1] flex w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-[#0b1220] text-white shadow-[0_-20px_60px_rgba(0,0,0,0.45)] sm:rounded-[28px]"
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <div className="min-w-0">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20 sm:hidden" />
            <h2 className="truncate text-lg font-semibold tracking-tight">{title}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-white/55">{hint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 pb-3 pt-1">
          <TicketQrScanner
            readerId={readerId}
            active={open}
            onScan={(raw) => {
              onClose()
              onScan(raw)
            }}
          />
        </div>

        <div className="border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 w-full items-center justify-center rounded-2xl bg-white text-sm font-semibold text-neutral-950"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
