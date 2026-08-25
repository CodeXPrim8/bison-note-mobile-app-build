'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import type { EventWithTiers } from '@/lib/types/database'
import { eventCategoryLabel } from '@/lib/schemas/event'

export function PublicEventsGrid({ limit }: { limit?: number }) {
  const [events, setEvents] = useState<EventWithTiers[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/events', { credentials: 'include' })
      .then(async (res) => {
        const json = (await res.json()) as { status: boolean; data?: EventWithTiers[]; message?: string }
        if (json.status) setEvents((json.data ?? []).slice(0, limit ?? 50))
        else setError(json.message ?? 'Could not load events')
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
      {events.map((event) => (
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
                {new Date(event.start_time).toLocaleString()} · {event.venue_name}
              </p>
              <p className="mt-3 font-bold text-primary">
                From ₦{Number(event.starting_price ?? 0).toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {event.tickets_available ? `${event.tickets_available} tickets left` : 'Check availability'}
                {event.organizer_name ? ` · ${event.organizer_name}` : ''}
              </p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}
