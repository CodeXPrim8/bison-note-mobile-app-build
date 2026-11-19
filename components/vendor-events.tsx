'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { ArrowLeft, CalendarDays, MapPin, Percent, QrCode } from 'lucide-react'
import { formatEventDate } from '@/lib/datetime'
import { useAccount } from '@/components/account-store'
import { bindAccountSnapshots, readSessionSnapshot, writeSessionSnapshot } from '@/lib/session-snapshot'

type LinkedEvent = {
  event_id: string
  event_title?: string
  status: string
  commission_pct: number
  event_start?: string
  venue_name?: string | null
  venue_address?: string | null
  organizer_name?: string | null
  cover_image_url?: string | null
}

type CatalogEvent = {
  id: string
  title: string
  start_time?: string
  venue_name?: string
  venue_address?: string
  cover_image_url?: string
  organizer_name?: string
  vendors_invite_enabled?: boolean
}

type EventsCache = {
  links: LinkedEvent[]
  catalog: CatalogEvent[]
  qrByEventId: Record<string, string>
}

const CACHE_KEY = 'bu_vendor_events'

function posQrPayload(userId: string, event: LinkedEvent) {
  return JSON.stringify({
    type: 'pos',
    vendor_id: userId,
    event_id: event.event_id,
    mode: 'event',
    label: event.event_title ? `Ceremonial cash · ${event.event_title}` : 'Ceremonial cash',
  })
}

async function buildQrMap(userId: string, events: LinkedEvent[], previous: Record<string, string> = {}) {
  const next: Record<string, string> = { ...previous }
  await Promise.all(
    events.map(async (event) => {
      if (next[event.event_id]) return
      try {
        next[event.event_id] = await QRCode.toDataURL(posQrPayload(userId, event), {
          width: 280,
          margin: 1,
        })
      } catch {
        // keep missing; detail can retry
      }
    }),
  )
  return next
}

export default function VendorEvents({
  onBack,
}: {
  onOpenPos?: (event: { eventId: string; eventTitle?: string }) => void
  onBack?: () => void
} = {}) {
  const { userId } = useAccount()
  const cached = userId ? readSessionSnapshot<EventsCache>(CACHE_KEY) : null
  const [active, setActive] = useState<LinkedEvent | null>(null)
  const [links, setLinks] = useState<LinkedEvent[]>(cached?.links ?? [])
  const [catalog, setCatalog] = useState<CatalogEvent[]>(cached?.catalog ?? [])
  const [qrByEventId, setQrByEventId] = useState<Record<string, string>>(cached?.qrByEventId ?? {})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(Boolean(cached?.links?.length))
  const qrWarmRef = useRef(0)

  const persist = useCallback((partial: Partial<EventsCache>) => {
    const current = readSessionSnapshot<EventsCache>(CACHE_KEY) ?? {
      links: [],
      catalog: [],
      qrByEventId: {},
    }
    writeSessionSnapshot(CACHE_KEY, {
      links: partial.links ?? current.links,
      catalog: partial.catalog ?? current.catalog,
      qrByEventId: partial.qrByEventId ?? current.qrByEventId,
    })
  }, [])

  const load = useCallback(async () => {
    try {
      const linksRes = await fetch('/api/pos/vendors?mine=1', { credentials: 'include' })
      const linksJson = await linksRes.json()
      const nextLinks = linksJson.status ? ((linksJson.data?.links ?? []) as LinkedEvent[]) : []
      setLinks(nextLinks)
      setReady(true)
      persist({ links: nextLinks })

      // Catalog for invites only — don’t block approved event open
      void fetch('/api/events', { credentials: 'include' })
        .then(async (eventsRes) => {
          const eventsJson = await eventsRes.json()
          if (!eventsJson.status) return
          const list = (Array.isArray(eventsJson.data) ? eventsJson.data : []) as Array<
            Record<string, unknown>
          >
          const nextCatalog = list
            .map((event) => ({
              id: String(event.id ?? ''),
              title: String(event.title ?? event.name ?? 'Event'),
              start_time: event.start_time ? String(event.start_time) : undefined,
              venue_name: event.venue_name ? String(event.venue_name) : undefined,
              venue_address: event.venue_address ? String(event.venue_address) : undefined,
              cover_image_url: event.cover_image_url ? String(event.cover_image_url) : undefined,
              organizer_name: event.organizer_name ? String(event.organizer_name) : undefined,
              vendors_invite_enabled: event.vendors_invite_enabled !== false,
            }))
            .filter((event) => event.id)
          setCatalog(nextCatalog)
          persist({ catalog: nextCatalog })
        })
        .catch(() => undefined)
    } catch {
      setMessage('Could not load events.')
      setReady(true)
    }
  }, [persist])

  useEffect(() => {
    bindAccountSnapshots(userId || null)
    void load()
  }, [load, userId])

  const approved = useMemo(() => links.filter((row) => row.status === 'approved'), [links])
  const pending = useMemo(() => links.filter((row) => row.status === 'pending'), [links])
  const linkByEvent = useMemo(() => new Map(links.map((row) => [row.event_id, row])), [links])

  const invitations = useMemo(() => {
    return catalog
      .filter((event) => event.vendors_invite_enabled !== false)
      .filter((event) => {
        const link = linkByEvent.get(event.id)
        return !link || link.status === 'revoked'
      })
      .slice(0, 30)
  }, [catalog, linkByEvent])

  // Warm QR codes for approved events so open is instant
  useEffect(() => {
    if (!userId || approved.length === 0) return
    const token = ++qrWarmRef.current
    void buildQrMap(userId, approved, qrByEventId).then((next) => {
      if (token !== qrWarmRef.current) return
      setQrByEventId(next)
      persist({ qrByEventId: next })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- warm when approved ids / user change
  }, [userId, approved.map((row) => row.event_id).join('|'), persist])

  async function requestJoin(eventId: string) {
    if (!eventId) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/pos/vendors', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', event_id: eventId }),
      })
      const json = await res.json()
      setBusy(false)
      if (!json.status) {
        setMessage(json.message ?? 'Request failed')
        return
      }
      setMessage('Request sent')
      await load()
    } catch {
      setBusy(false)
      setMessage('Request failed')
    }
  }

  function openEvent(row: LinkedEvent) {
    setActive(row)
    if (!userId || qrByEventId[row.event_id]) return
    void QRCode.toDataURL(posQrPayload(userId, row), { width: 280, margin: 1 })
      .then((image) => {
        setQrByEventId((prev) => {
          const next = { ...prev, [row.event_id]: image }
          persist({ qrByEventId: next })
          return next
        })
      })
      .catch(() => undefined)
  }

  if (active) {
    const pct = active.commission_pct || 10
    const venue =
      [active.venue_name, active.venue_address].filter(Boolean).join(' · ') || null
    const qrImage = qrByEventId[active.event_id] || ''

    return (
      <div className="space-y-4 text-neutral-950">
        <button
          type="button"
          aria-label="Back"
          onClick={() => setActive(null)}
          className="bu-press bu-back-chip"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="bu-event-detail p-5">
          <div className="relative z-[1] space-y-5">
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">
                Ceremonial cash
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                {active.event_title || 'Event'}
              </h2>
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="bu-glass-dark inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-white/90">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {active.event_start ? formatEventDate(active.event_start) : 'Date TBA'}
                </span>
                <span className="bu-glass-dark inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-white/90">
                  <Percent className="h-3.5 w-3.5" />
                  {pct}%
                </span>
              </div>
              {venue ? (
                <p className="flex items-start gap-2 pt-1 text-sm text-white/70">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{venue}</span>
                </p>
              ) : null}
              {active.organizer_name ? (
                <p className="text-sm text-white/55">{active.organizer_name}</p>
              ) : null}
            </div>

            <div className="bu-event-qr mx-auto flex w-fit flex-col items-center gap-3 p-4">
              {qrImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrImage} alt="QR" className="h-52 w-52 rounded-xl bg-white p-2" />
              ) : (
                <div className="flex h-52 w-52 items-center justify-center rounded-xl bg-white/80">
                  <QrCode className="h-10 w-10 text-neutral-300" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 text-neutral-950">
      <div className="flex items-center gap-3">
        {onBack ? (
          <button type="button" aria-label="Back" onClick={onBack} className="bu-press bu-back-chip">
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : null}
        <h2 className="text-lg font-semibold">Events</h2>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Approved</h3>
        {ready && approved.length === 0 ? <p className="text-sm text-neutral-500">None</p> : null}
        {approved.map((row) => (
          <button
            key={row.event_id}
            type="button"
            onClick={() => openEvent(row)}
            className="bu-press bu-event-card flex w-full items-center gap-3 px-4 py-4 text-left"
          >
            <div className="relative z-[1] flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-950 text-white shadow-[0_8px_20px_rgba(11,23,51,0.25)]">
                <QrCode className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{row.event_title || row.event_id}</p>
                <p className="truncate text-[11px] text-neutral-500">
                  {row.event_start ? formatEventDate(row.event_start) : '—'}
                  {row.venue_name ? ` · ${row.venue_name}` : ''} · {row.commission_pct}%
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {pending.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Pending</h3>
          {pending.map((row) => (
            <div key={row.event_id} className="bu-glass-soft rounded-2xl px-4 py-3">
              <p className="truncate text-sm font-semibold">{row.event_title || row.event_id}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Invites</h3>
        {ready && invitations.length === 0 ? <p className="text-sm text-neutral-500">None</p> : null}
        {invitations.map((event) => (
          <div
            key={event.id}
            className="bu-glass-soft flex items-center justify-between gap-2 rounded-2xl px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{event.title}</p>
              <p className="text-[11px] text-neutral-500">
                {event.start_time ? formatEventDate(event.start_time) : '—'}
              </p>
            </div>
            <Button size="sm" disabled={busy} onClick={() => void requestJoin(event.id)}>
              Request
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
