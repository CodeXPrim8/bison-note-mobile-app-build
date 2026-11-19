'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { adminFetch } from '@/components/admin/api'

type EventRow = {
  id: string
  title: string
  is_public: boolean
  date: string
  location: string | null
  organizer_id: string
  organizer_name: string
  organizer_phone: string | null
  organizer_suspended: boolean
}

type VendorLink = {
  id: string
  event_id: string
  vendor_user_id: string
  commission_pct: number
  status: 'pending' | 'approved' | 'revoked'
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [openVendorsFor, setOpenVendorsFor] = useState<string | null>(null)
  const [vendors, setVendors] = useState<VendorLink[]>([])
  const [vendorBusy, setVendorBusy] = useState(false)

  async function load() {
    const data = await adminFetch<{ events: EventRow[] }>('/api/admin/events')
    setEvents(data.events)
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message))
  }, [])

  async function patch(event_id: string, body: Record<string, unknown>) {
    try {
      await adminFetch('/api/admin/events', { method: 'PATCH', body: JSON.stringify({ event_id, ...body }) })
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function loadVendors(eventId: string) {
    setOpenVendorsFor(eventId)
    setVendors([])
    try {
      const data = await adminFetch<{ vendors: VendorLink[] }>(
        `/api/admin/event-vendors?event_id=${encodeURIComponent(eventId)}`,
      )
      setVendors(data.vendors)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function setVendorStatus(eventId: string, vendorUserId: string, status: 'approved' | 'revoked') {
    setVendorBusy(true)
    try {
      await adminFetch('/api/admin/event-vendors', {
        method: 'PATCH',
        body: JSON.stringify({ event_id: eventId, vendor_user_id: vendorUserId, status }),
      })
      await loadVendors(eventId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setVendorBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300">Catalog</p>
        <h1 className="mt-1 text-3xl font-bold">Events</h1>
        <p className="text-sm text-muted-foreground">
          Pull a party off public, delete it, or oversee event vendors.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-3">
        {events.map((event) => (
          <Card key={event.id} className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{event.title || 'Untitled'}</p>
                <p className="text-xs text-muted-foreground">
                  {event.organizer_name} · {event.organizer_phone} · {event.is_public ? 'Public' : 'Private'} ·{' '}
                  {event.date}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void patch(event.id, { public: !event.is_public })}>
                  {event.is_public ? 'Remove from public' : 'Make public'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void patch(event.id, { suspend_organizer: !event.organizer_suspended })}
                >
                  {event.organizer_suspended ? 'Unfreeze organiser' : 'Suspend organiser'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    openVendorsFor === event.id ? setOpenVendorsFor(null) : void loadVendors(event.id)
                  }
                >
                  {openVendorsFor === event.id ? 'Hide vendors' : 'Vendors'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (!window.confirm(`Delete “${event.title || 'this event'}”? This cannot be undone.`)) return
                    void patch(event.id, { delete: true })
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
            {openVendorsFor === event.id && (
              <div className="space-y-2 border-t border-white/10 pt-3">
                {vendors.length === 0 && (
                  <p className="text-sm text-muted-foreground">No vendor links for this event.</p>
                )}
                {vendors.map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {row.vendor_user_id.slice(0, 8)}… · {row.status} · {row.commission_pct}%
                    </span>
                    <div className="flex gap-2">
                      {row.status !== 'approved' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={vendorBusy}
                          onClick={() => void setVendorStatus(event.id, row.vendor_user_id, 'approved')}
                        >
                          Approve
                        </Button>
                      )}
                      {row.status !== 'revoked' && (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={vendorBusy}
                          onClick={() => void setVendorStatus(event.id, row.vendor_user_id, 'revoked')}
                        >
                          Force revoke
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
        {!events.length && <p className="text-muted-foreground">No events loaded.</p>}
      </div>
    </div>
  )
}
