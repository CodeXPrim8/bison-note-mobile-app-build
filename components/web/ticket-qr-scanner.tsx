'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type NativeDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>
}

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
  const videoRef = useRef<HTMLVideoElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return
    let stopped = false
    let stream: MediaStream | null = null
    let raf = 0
    let html5: { stop: () => Promise<void> } | null = null
    const video = videoRef.current

    function emit(value: string) {
      const text = value.trim()
      if (text) onScanRef.current(text)
    }

    async function startNative() {
      const Detector = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => NativeDetector })
        .BarcodeDetector
      if (!Detector || !video) return false
      try {
        const formats = typeof (Detector as unknown as { getSupportedFormats?: () => Promise<string[]> }).getSupportedFormats === 'function'
          ? await (Detector as unknown as { getSupportedFormats: () => Promise<string[]> }).getSupportedFormats()
          : ['qr_code']
        if (formats.length && !formats.includes('qr_code')) return false
      } catch {
        return false
      }

      const detector = new Detector({ formats: ['qr_code'] })
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop())
        return false
      }
      video.srcObject = stream
      video.setAttribute('playsinline', 'true')
      await video.play()

      let last = 0
      const tick = async (now: number) => {
        if (stopped) return
        if (now - last >= 40 && video.readyState >= 2) {
          last = now
          try {
            const codes = await detector.detect(video)
            const value = codes[0]?.rawValue
            if (value) emit(value)
          } catch {
            /* drop this frame */
          }
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return true
    }

    async function startHtml5() {
      const host = fallbackRef.current
      if (!host) return
      const { Html5Qrcode } = await import('html5-qrcode')
      if (stopped) return
      const instance = new Html5Qrcode(readerId)
      html5 = instance
      await instance.start(
        { facingMode: 'environment' },
        {
          fps: 24,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.82)
            return { width: size, height: size }
          },
        },
        (decoded) => emit(decoded),
        () => undefined,
      )
    }

    startNative()
      .then((ok) => {
        if (!ok && !stopped) return startHtml5()
      })
      .catch(() => {
        stream?.getTracks().forEach((track) => track.stop())
        stream = null
        if (video) video.srcObject = null
        if (!stopped) return startHtml5()
      })

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((track) => track.stop())
      if (video) video.srcObject = null
      html5?.stop().catch(() => undefined)
    }
  }, [active, readerId])

  return (
    <div className={cn('relative h-full min-h-[280px] overflow-hidden bg-black', className)}>
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        muted
        playsInline
        autoPlay
      />
      <div id={readerId} ref={fallbackRef} className="absolute inset-0 pointer-events-none" />
    </div>
  )
}
