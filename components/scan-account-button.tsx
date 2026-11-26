'use client'

import { useState } from 'react'
import { QrCode } from 'lucide-react'
import { QrScanPopup } from '@/components/qr-scan-popup'

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
      <QrScanPopup
        open={open}
        onClose={() => setOpen(false)}
        onScan={onScan}
        title={label}
        hint="Point at the QR. The account fills in automatically."
        readerId="bu-scan-to-pay"
      />
    </>
  )
}
