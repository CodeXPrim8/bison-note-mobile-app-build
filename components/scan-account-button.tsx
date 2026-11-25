'use client'

import { useState } from 'react'
import { QrCode } from 'lucide-react'
import { TicketQrScanner } from '@/components/web/ticket-qr-scanner'

export function ScanAccountButton({
  onScan,
  label = 'Scan to pay',
}: {
  onScan: (raw: string) => void
  label?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white"
      >
        <QrCode className="h-4 w-4" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-[80] flex flex-col justify-end bg-black/55 p-4 sm:items-center sm:justify-center">
          <div className="bu-glass w-full max-w-md space-y-3 rounded-[24px] p-4">
            <p className="text-sm font-semibold">Scan to pay</p>
            <p className="text-xs text-neutral-500">Point at the QR on the wall. The account number fills in by itself.</p>
            <TicketQrScanner
              readerId="bu-scan-to-pay"
              active={open}
              onScan={(raw) => {
                setOpen(false)
                onScan(raw)
              }}
            />
            <button
              type="button"
              className="h-11 w-full rounded-2xl bg-neutral-950 text-sm font-semibold text-white"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
