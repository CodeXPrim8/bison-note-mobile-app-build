'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, MapPin, Ticket, Users } from 'lucide-react'
import type { EventWithTiers } from '@/lib/types/database'

interface EventInfoProps {
  eventId?: string
  onNavigate?: (page: string, data?: unknown) => void
}

export default function EventInfo({ eventId, onNavigate }: EventInfoProps) {
  const [event, setEvent] = useState<EventWithTiers | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/events')
      .then(async (res) => {
        const json = await res.json()
        const match = (json.data ?? []).find((item: EventWithTiers) => item.id === eventId)
        if (match) setEvent(match)
        else setError('Event not found or it is private')
      })
      .catch(() => setError('Could not load event'))
  }, [eventId])

  if (error || !event) {
    return (
      <div className="space-y-6 px-4 pb-24 pt-4">
        <p className="text-muted-foreground">{error ?? 'Loading event details...'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-24 pt-4">
      <div className="px-4">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-6">
          <h1 className="mb-4 text-2xl font-bold">{event.title}</h1>
          <p className="mb-4 text-muted-foreground">{event.description}</p>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-primary" />
              <p className="font-semibold">{new Date(event.start_time).toLocaleString()}</p>
            </div>
            {event.venue_name && (
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-primary" />
                <p className="font-semibold">{event.venue_name}</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Ticket className="h-5 w-5 text-primary" />
              <p className="font-semibold">From ₦{Number(event.starting_price ?? 0).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">{event.organizer_name ?? event.celebrant_name}</p>
            </div>
          </div>
          <Button className="mt-6 w-full" onClick={() => (window.location.href = `/checkout/${event.slug}`)}>
            Buy Tickets
          </Button>
          <Button className="mt-2 w-full" variant="outline" onClick={() => onNavigate?.('events')}>
            Back to events
          </Button>
        </Card>
      </div>
    </div>
  )
}
