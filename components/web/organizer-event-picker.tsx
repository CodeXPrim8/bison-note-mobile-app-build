'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import type { EventRecord } from '@/lib/types/database'
import { formatEventDateTime } from '@/lib/datetime'
import { eventVenueLabel } from '@/lib/events/event-details'

export function OrganizerEventPicker({
  title,
  body,
  hrefSuffix,
}: {
  title: string
  body: string
  hrefSuffix: string
}) {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/events/mine')
      .then(async (res) => {
        const json = await res.json()
        if (json.status) setEvents(json.data ?? [])
        else {
          setEvents([])
          setError(json.message)
        }
      })
      .catch(() => {
        setEvents([])
        setError('Could not load events')
      })
  }, [])

  return (
    <div>
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      <div className="mt-6 space-y-3">
        {events.map((event) => (
          <Link key={event.id} href={`/organizer/events/${event.id}${hrefSuffix}`}>
            <Card className="p-5 transition hover:border-primary/40">
              <p className="font-semibold">{event.title}</p>
              <p className="text-sm text-muted-foreground">
                {formatEventDateTime(event.start_time)} · {eventVenueLabel(event)}
              </p>
            </Card>
          </Link>
        ))}
        {events.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">No events yet. Create one first.</p>
        )}
      </div>
    </div>
  )
}
