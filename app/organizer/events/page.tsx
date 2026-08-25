'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { EventRecord } from '@/lib/types/database'

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
          <Link key={event.id} href={`/organizer/events/${event.id}`}>
            <Card className="p-5 transition hover:border-primary/40">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{event.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {new Date(event.start_time).toLocaleString()} · {event.venue_name}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline">{event.visibility}</Badge>
                  <Badge>{event.status}</Badge>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
