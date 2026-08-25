'use client'

import { useEffect, useRef } from 'react'

export function TicketQrScanner({
  onScan,
  active,
  readerId = 'bu-checkin-reader',
}: {
  onScan: (text: string) => void
  active: boolean
  readerId?: string
}) {
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (!active) return
    let stopped = false
    let scanner: { stop: () => Promise<void> } | null = null

    async function start() {
      const { Html5Qrcode } = await import('html5-qrcode')
      if (stopped) return
      const instance = new Html5Qrcode(readerId)
      scanner = instance
      await instance.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          onScanRef.current(decoded)
        },
        () => undefined,
      )
    }

    start().catch(() => undefined)
    return () => {
      stopped = true
      scanner?.stop().catch(() => undefined)
    }
  }, [active, readerId])

  return <div id={readerId} className="overflow-hidden rounded-xl bg-black" />
}
