'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import type { EventWithTiers } from '@/lib/types/database'
import { eventCategoryLabel } from '@/lib/schemas/event'
import { EventStatusBadge } from '@/components/event-status-badge'
import { EventTicketList } from '@/components/event-ticket-list'
import { eventDateHasPassed, isUpcomingListingEvent, listingRemaining } from '@/lib/events/sale'
import { formatEventDateTime } from '@/lib/datetime'
import { eventVenueLabel } from '@/lib/events/event-details'

export function PublicEventsGrid({ limit }: { limit?: number }) {
  const [events, setEvents] = useState<EventWithTiers[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/events', { credentials: 'include' })
      .then(async (res) => {
        const json = (await res.json()) as { status: boolean; data?: EventWithTiers[]; message?: string }
        if (json.status) {
          const upcoming = (json.data ?? []).filter((event) => isUpcomingListingEvent(event))
          setEvents(upcoming.slice(0, limit ?? 50))
        } else setError(json.message ?? 'Could not load events')
      })
      .catch(() => setError('Could not load events. Configure Supabase to list live events.'))
  }, [limit])

  if (error) {
    return <p className="text-sm text-muted-foreground">{error}</p>
  }
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No public upcoming events yet. Create one as an organiser.</p>
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => {
        const remaining = listingRemaining(event)
        return (
          <Link key={event.id} href={`/events/${event.slug}`}>
            <Card className="h-full overflow-hidden border-primary/20 transition hover:border-primary/50">
              <div
                className="h-36 bg-cover bg-center bg-gradient-to-br from-primary/40 to-primary/10"
                style={event.cover_image_url ? { backgroundImage: `url(${event.cover_image_url})` } : undefined}
              />
              <div className="p-5">
                <p className="text-xs uppercase tracking-wide text-primary">{eventCategoryLabel(event.category) ?? 'Event'}</p>
                <h3 className="mt-1 text-lg font-semibold">{event.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {formatEventDateTime(event.start_time)} · {eventVenueLabel(event)}
                </p>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tickets</p>
                  <EventStatusBadge event={event} remaining={remaining} />
                </div>
                <div className="mt-2">
                  <EventTicketList tiers={event.ticket_tiers} ended={eventDateHasPassed(event)} />
                </div>
              </div>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
