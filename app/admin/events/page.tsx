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

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300">Catalog</p>
        <h1 className="mt-1 text-3xl font-bold">Events</h1>
        <p className="text-sm text-muted-foreground">Pull a party off public, or suspend the organiser so none of their events list.</p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-3">
        {events.map((event) => (
          <Card key={event.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="font-semibold">{event.title || 'Untitled'}</p>
              <p className="text-xs text-muted-foreground">
                {event.organizer_name} · {event.organizer_phone} · {event.is_public ? 'Public' : 'Private'} · {event.date}
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
            </div>
          </Card>
        ))}
        {!events.length && <p className="text-muted-foreground">No events loaded.</p>}
      </div>
    </div>
  )
}
