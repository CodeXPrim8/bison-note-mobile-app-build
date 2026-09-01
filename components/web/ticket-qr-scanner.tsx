'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export function TicketQrScanner({
  onScan,
  active,
  readerId = 'bu-checkin-reader',
  className,
}: {
  onScan: (text: string) => void
  active: boolean
  readerId?: string
  className?: string
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
        { fps: 12, qrbox: (viewfinderWidth, viewfinderHeight) => {
          const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.85)
          return { width: size, height: size }
        } },
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

  return <div id={readerId} className={cn('h-full min-h-[280px] overflow-hidden bg-black', className)} />
}
