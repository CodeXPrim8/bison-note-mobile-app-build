'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ScanLine, ShieldCheck, ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TicketQrScanner } from '@/components/web/ticket-qr-scanner'
import { cn } from '@/lib/utils'

type GateVerdict = {
  allowed: boolean
  label: 'ACCESS' | 'DENIED'
  reason?: string
  guest?: string
  tier?: string
}

function looksLikeQrPayload(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith('{') || /BU_LIVE_/i.test(trimmed)
}

function denyReason(status?: string, message?: string) {
  const text = (message ?? '').trim()
  if (status === 'already_used') return 'Already admitted'
  if (status === 'refunded') return 'This ticket was refunded'
  if (/different event/i.test(text)) return 'Wrong event'
  if (/rate/i.test(text)) return 'Too many scans — wait a moment'
  if (/invalid ticket/i.test(text)) return 'Not recognised'
  if (text && !/checked in|cannot be used|qr is closed/i.test(text) && text.length < 80) {
    return text
  }
  return 'Not recognised'
}

function verdictFromJson(json: Record<string, unknown>): GateVerdict {
  const data = (json.data && typeof json.data === 'object' ? json.data : json) as Record<string, unknown>
  const ticket =
    data.ticket && typeof data.ticket === 'object' ? (data.ticket as Record<string, unknown>) : null
  const status = typeof data.status === 'string' ? data.status : undefined
  const message =
    typeof data.message === 'string'
      ? data.message
      : typeof json.message === 'string'
        ? json.message
        : undefined
  const guest =
    (typeof data.buyer_name === 'string' && data.buyer_name) ||
    (typeof ticket?.buyer_name === 'string' && ticket.buyer_name) ||
    undefined
  const tier = typeof data.tier_name === 'string' ? data.tier_name : undefined
  const allowed = json.status !== false && (status === 'checked_in' || status === 'valid')
  if (allowed) {
    return { allowed: true, label: 'ACCESS', guest, tier }
  }
  return {
    allowed: false,
    label: 'DENIED',
    reason: denyReason(status, message),
    guest,
    tier,
  }
}

function ScanCorners({ tone }: { tone?: 'idle' | 'ok' | 'no' }) {
  const color =
    tone === 'ok' ? 'border-emerald-300' : tone === 'no' ? 'border-red-400' : 'border-white/75'
  return (
    <div className="pointer-events-none absolute inset-3 sm:inset-4">
      <span className={cn('absolute left-0 top-0 h-11 w-11 rounded-tl-sm border-l-2 border-t-2', color)} />
      <span className={cn('absolute right-0 top-0 h-11 w-11 rounded-tr-sm border-r-2 border-t-2', color)} />
      <span className={cn('absolute bottom-0 left-0 h-11 w-11 rounded-bl-sm border-b-2 border-l-2', color)} />
      <span className={cn('absolute bottom-0 right-0 h-11 w-11 rounded-br-sm border-b-2 border-r-2', color)} />
    </div>
  )
}

export function AccessGate({ eventId }: { eventId: string }) {
  const [eventTitle, setEventTitle] = useState('')
  const [camera, setCamera] = useState(false)
  const [backup, setBackup] = useState('')
  const [busy, setBusy] = useState(false)
  const [verdict, setVerdict] = useState<GateVerdict | null>(null)
  const [stampKey, setStampKey] = useState(0)
  const busyRef = useRef(false)
  const verdictOpenRef = useRef(false)
  const lastScanRef = useRef({ value: '', at: 0 })

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    fetch(`/api/events/${eventId}`, { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        const title = json.data?.event?.title
        if (!cancelled && typeof title === 'string') setEventTitle(title)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [eventId])

  const dismiss = useCallback(() => {
    setVerdict(null)
    verdictOpenRef.current = false
  }, [])

  async function authenticate(payload: string | undefined) {
    if (!eventId) return
    const value = (payload ?? backup).trim()
    if (!value) return
    const now = Date.now()
    if (busyRef.current || verdictOpenRef.current) return
    if (lastScanRef.current.value === value && now - lastScanRef.current.at < 1600) return
    lastScanRef.current = { value, at: now }
    busyRef.current = true
    setBusy(true)
    const qr = looksLikeQrPayload(value)
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          confirm: true,
          qr_payload: qr ? value : undefined,
          checkin_code: qr ? undefined : value,
        }),
      })
      const json = (await res.json()) as Record<string, unknown>
      const next = verdictFromJson(json)
      verdictOpenRef.current = true
      setVerdict(next)
      setStampKey((n) => n + 1)
      setBackup('')
      try {
        navigator.vibrate?.(next.allowed ? 35 : [55, 40, 55])
      } catch {
        /* ignore */
      }
    } catch {
      verdictOpenRef.current = true
      setVerdict({ allowed: false, label: 'DENIED', reason: 'Could not reach ɃU' })
      setStampKey((n) => n + 1)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const tone = verdict ? (verdict.allowed ? 'ok' : 'no') : 'idle'
  const meta = [verdict?.guest, verdict?.tier].filter(Boolean).join(' · ')

  return (
    <div className="mx-auto max-w-md">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">Authentication</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{eventTitle || 'Door'}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Hold a ticket to the scanner</p>

      <div
        className={cn(
          'relative mt-5 overflow-hidden rounded-[28px] border bg-black shadow-[0_0_80px_rgba(0,0,0,0.55)]',
          tone === 'ok' && 'border-emerald-400/50',
          tone === 'no' && 'border-red-500/50',
          tone === 'idle' && 'border-white/10',
        )}
      >
        <div className="relative h-[min(52vh,380px)] min-h-[240px]">
          {camera ? (
            <TicketQrScanner
              active={camera}
              className="absolute inset-0 h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
              onScan={(text) => {
                void authenticate(text)
              }}
            />
          ) : !verdict ? (
            <button
              type="button"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.07),transparent_62%)]"
              onClick={() => setCamera(true)}
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/5">
                <ScanLine className="h-7 w-7 text-white/80" />
              </span>
              <span className="text-sm font-medium tracking-wide text-white/80">Open scanner</span>
            </button>
          ) : null}

          {camera && !verdict && (
            <div
              className="pointer-events-none absolute inset-x-10 h-px bg-gradient-to-r from-transparent via-primary to-transparent"
              style={{ animation: 'gate-scanline 2.1s ease-in-out infinite' }}
            />
          )}

          <ScanCorners tone={tone} />

          {busy && !verdict && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/55">
              <p className="text-[11px] uppercase tracking-[0.32em] text-white/80">Reading</p>
            </div>
          )}

          {verdict && (
            <div
              key={stampKey}
              className={cn(
                'absolute inset-0 z-20 flex flex-col items-center justify-center bg-black px-6 text-center',
                verdict.allowed
                  ? 'bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.45)_0%,#050505_62%)]'
                  : 'bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.5)_0%,#050505_62%)]',
              )}
            >
              <span
                className={cn(
                  'mb-5 flex h-16 w-16 items-center justify-center rounded-full border',
                  verdict.allowed
                    ? 'border-emerald-300/50 bg-emerald-400/15 text-emerald-300'
                    : 'border-red-400/50 bg-red-500/15 text-red-400',
                )}
                style={{ animation: 'gate-glow 1.6s ease-in-out infinite' }}
              >
                {verdict.allowed ? <ShieldCheck className="h-8 w-8" /> : <ShieldX className="h-8 w-8" />}
              </span>
              <p
                className={cn(
                  'font-black uppercase tracking-[0.22em]',
                  verdict.allowed ? 'text-emerald-300' : 'text-red-400',
                )}
                style={{ animation: 'gate-stamp 380ms cubic-bezier(0.16, 1, 0.3, 1)', fontSize: 'clamp(2.6rem, 14vw, 4rem)' }}
              >
                {verdict.label}
              </p>
              {verdict.allowed ? (
                <p className="mt-3 text-sm text-emerald-50/80">{meta || 'Let them through'}</p>
              ) : (
                <p className="mt-3 text-sm text-red-50/80">{verdict.reason}</p>
              )}
              {!verdict.allowed && meta && <p className="mt-1 text-xs text-white/45">{meta}</p>}
              <button
                type="button"
                onClick={dismiss}
                className="mt-8 rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white"
              >
                Scan next ticket
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <Input
          value={backup}
          onChange={(e) => setBackup(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void authenticate(backup)
          }}
          placeholder="Backup code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="h-12 rounded-xl bg-card font-mono tracking-[0.18em]"
        />
        <Button
          className="h-12 shrink-0 rounded-xl px-5"
          disabled={busy || !backup.trim()}
          onClick={() => void authenticate(backup)}
        >
          Verify
        </Button>
      </div>

      {camera && (
        <button
          type="button"
          className="mt-3 w-full text-center text-xs text-muted-foreground"
          onClick={() => setCamera(false)}
        >
          Close camera
        </button>
      )}
    </div>
  )
}
