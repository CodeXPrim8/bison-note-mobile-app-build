'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type NativeDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>
}

type ScanStatus = 'starting' | 'live' | 'error'

async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera is not available in this browser.')
  }
  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
    { audio: false, video: { facingMode: 'environment' } },
    { audio: false, video: { facingMode: 'user' } },
    { audio: false, video: true },
  ]
  let lastError: unknown
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (error) {
      lastError = error
    }
  }
  const name = lastError && typeof lastError === 'object' && 'name' in lastError ? String((lastError as { name: string }).name) : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    throw new Error('Camera permission denied. Allow camera access and try again.')
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    throw new Error('No camera found on this device.')
  }
  throw new Error('Could not open the camera. Try again in a secure (HTTPS) tab.')
}

function waitTwoFrames() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
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
  const html5HostRef = useRef<HTMLDivElement>(null)
  const lastEmitRef = useRef({ value: '', at: 0 })
  const [status, setStatus] = useState<ScanStatus>('starting')
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!active) {
      setStatus('starting')
      setError(null)
      return
    }

    let stopped = false
    let stream: MediaStream | null = null
    let raf = 0
    let html5: { stop: () => Promise<void>; clear?: () => void } | null = null
    const video = videoRef.current

    function emit(value: string) {
      const text = value.trim()
      if (!text) return
      const now = Date.now()
      if (text === lastEmitRef.current.value && now - lastEmitRef.current.at < 1600) return
      lastEmitRef.current = { value: text, at: now }
      onScanRef.current(text)
    }

    async function startNativeDetector(): Promise<boolean> {
      const Detector = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => NativeDetector })
        .BarcodeDetector
      if (!Detector || !video) return false
      try {
        const getFormats = (Detector as unknown as { getSupportedFormats?: () => Promise<string[]> }).getSupportedFormats
        if (typeof getFormats === 'function') {
          const formats = await getFormats()
          if (formats.length && !formats.includes('qr_code')) return false
        }
      } catch {
        return false
      }

      stream = await openCamera()
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop())
        return false
      }

      video.srcObject = stream
      video.muted = true
      video.setAttribute('playsinline', 'true')
      video.setAttribute('webkit-playsinline', 'true')
      await video.play()
      if (stopped) return false

      const detector = new Detector({ formats: ['qr_code'] })
      setStatus('live')
      let last = 0
      const tick = async (now: number) => {
        if (stopped) return
        if (now - last >= 50 && video.readyState >= 2) {
          last = now
          try {
            const codes = await detector.detect(video)
            const value = codes[0]?.rawValue
            if (value) emit(value)
          } catch {
            /* drop frame */
          }
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return true
    }

    async function startHtml5(): Promise<boolean> {
      const host = html5HostRef.current
      if (!host) return false
      await waitTwoFrames()
      if (stopped) return false

      const { Html5Qrcode } = await import('html5-qrcode')
      if (stopped) return false

      // Clear stale scanner markup from a previous mount.
      host.innerHTML = ''
      const instance = new Html5Qrcode(readerId, { verbose: false })
      html5 = instance

      const configs = [{ facingMode: 'environment' as const }, { facingMode: 'user' as const }]
      let started = false
      let lastError: unknown
      for (const camera of configs) {
        try {
          await instance.start(
            camera,
            {
              fps: 20,
              aspectRatio: 1.333,
              qrbox: (viewfinderWidth, viewfinderHeight) => {
                const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72)
                return { width: size, height: size }
              },
              disableFlip: false,
            },
            (decoded) => emit(decoded),
            () => undefined,
          )
          started = true
          break
        } catch (error) {
          lastError = error
          try {
            await instance.stop()
          } catch {
            /* ignore */
          }
          try {
            instance.clear()
          } catch {
            /* ignore */
          }
        }
      }
      if (!started) {
        throw lastError instanceof Error ? lastError : new Error('Camera start failed')
      }
      if (stopped) {
        await instance.stop().catch(() => undefined)
        return false
      }
      setStatus('live')
      return true
    }

    setStatus('starting')
    setError(null)

    ;(async () => {
      try {
        const nativeOk = await startNativeDetector()
        if (stopped) return
        if (!nativeOk) await startHtml5()
      } catch (err) {
        if (stopped) return
        stream?.getTracks().forEach((track) => track.stop())
        stream = null
        if (video) video.srcObject = null
        const message = err instanceof Error ? err.message : 'Could not open the camera.'
        setError(message)
        setStatus('error')
      }
    })()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((track) => track.stop())
      if (video) {
        video.srcObject = null
      }
      const stopper = html5
      html5 = null
      if (stopper) {
        stopper
          .stop()
          .catch(() => undefined)
          .finally(() => {
            try {
              stopper.clear?.()
            } catch {
              /* ignore */
            }
          })
      }
    }
  }, [active, readerId, retryKey])

  return (
    <div
      className={cn(
        'relative aspect-[3/4] w-full overflow-hidden rounded-[24px] bg-neutral-950 sm:aspect-[4/3]',
        className,
      )}
    >
      <video
        ref={videoRef}
        className={cn(
          'absolute inset-0 h-full w-full object-cover',
          status === 'live' ? 'opacity-100' : 'opacity-0',
        )}
        muted
        playsInline
        autoPlay
      />
      <div
        id={readerId}
        ref={html5HostRef}
        className={cn(
          'absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover [&_img]:hidden',
          status === 'error' && 'hidden',
        )}
      />

      {/* Viewfinder */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_42%,rgba(0,0,0,0.45)_78%)]" />
        <div className="absolute left-1/2 top-1/2 h-[58%] w-[58%] max-h-[280px] max-w-[280px] -translate-x-1/2 -translate-y-1/2">
          <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-2xl border-l-[3px] border-t-[3px] border-white" />
          <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-2xl border-r-[3px] border-t-[3px] border-white" />
          <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-2xl border-b-[3px] border-l-[3px] border-white" />
          <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-2xl border-b-[3px] border-r-[3px] border-white" />
          <span className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-[#2f7bff] to-transparent opacity-80" />
        </div>
      </div>

      {status === 'starting' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/70">
          <p className="text-sm font-medium text-white/80">Starting camera…</p>
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-950 px-6 text-center">
          <p className="text-sm font-medium text-white">{error || 'Camera unavailable'}</p>
          <button
            type="button"
            className="h-11 rounded-full bg-white px-5 text-sm font-semibold text-neutral-950"
            onClick={() => setRetryKey((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  )
}
