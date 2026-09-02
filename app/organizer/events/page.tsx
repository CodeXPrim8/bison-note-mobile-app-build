'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { EventRecord } from '@/lib/types/database'
import { formatEventDateTime } from '@/lib/datetime'
import { eventVenueLabel } from '@/lib/events/event-details'
import { DeleteEventButton } from '@/components/organizer/delete-event-button'

export default function OrganizerEventsPage() {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/events/mine', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (json.status) setEvents(json.data)
        else setError(json.message)
      })
      .catch(() => setError('Could not load events'))
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Events</h1>
        <Button asChild>
          <Link href="/organizer/events/create">Create event</Link>
        </Button>
      </div>
      {error && <p className="mt-4 text-sm text-muted-foreground">{error}</p>}
      <div className="mt-6 space-y-3">
        {events.map((event) => (
          <Card key={event.id} className="p-5 transition hover:border-primary/40">
            <div className="flex items-start justify-between gap-4">
              <Link href={`/organizer/events/${event.id}`} className="min-w-0 flex-1">
                <h2 className="font-semibold">{event.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {formatEventDateTime(event.start_time)} · {eventVenueLabel(event)}
                </p>
              </Link>
              <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                <div className="flex gap-2">
                  <Badge variant="outline">{event.visibility}</Badge>
                  <Badge>{event.status}</Badge>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/organizer/events/${event.id}/edit`}>Edit</Link>
                </Button>
                <DeleteEventButton
                  eventId={event.id}
                  title={event.title}
                  redirectTo={null}
                  onDeleted={() => setEvents((current) => current.filter((item) => item.id !== event.id))}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
