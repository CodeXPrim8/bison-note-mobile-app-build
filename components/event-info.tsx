'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, MapPin, Ticket, Users } from 'lucide-react'
import { appCheckoutPath, eventListingStatus, eventOnSale, listingRemaining } from '@/lib/events/sale'
import { formatEventDateTime } from '@/lib/datetime'
import { EventStatusBadge } from '@/components/event-status-badge'
import type { EventWithTiers } from '@/lib/types/database'
import { readSessionSnapshot, writeSessionSnapshot } from '@/lib/session-snapshot'

interface EventInfoProps {
  eventId?: string
  onNavigate?: (page: string, data?: unknown) => void
}

export default function EventInfo({ eventId, onNavigate }: EventInfoProps) {
  const cached = eventId ? readSessionSnapshot<EventWithTiers>(`bu_event_${eventId}`) : null
  const [event, setEvent] = useState<EventWithTiers | null>(cached)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    if (!eventId) {
      setLoading(false)
      setError('Event not found')
      return
    }
    const snap = readSessionSnapshot<EventWithTiers>(`bu_event_${eventId}`)
    if (snap) {
      setEvent(snap)
      setLoading(false)
    } else {
      setLoading(true)
    }
    fetch(`/api/events/slug/${encodeURIComponent(eventId)}`, { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        setLoading(false)
        if (json.status && json.data) {
          const next = json.data as EventWithTiers
          setEvent(next)
          writeSessionSnapshot(`bu_event_${eventId}`, next)
          setError(null)
          return
        }
        setError(json.message ?? 'Event not found or it is private')
      })
      .catch(() => {
        setLoading(false)
        setError('Could not load event')
      })
  }, [eventId])

  if (loading) {
    return (
      <div className="space-y-6 px-4 pb-24 pt-4">
        <p className="text-sm text-muted-foreground">Loading event details…</p>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="space-y-6 px-4 pb-24 pt-4">
        <p className="text-muted-foreground">{error ?? 'Event not found'}</p>
        <Button variant="outline" className="w-full" onClick={() => onNavigate?.('events')}>
          Back to events
        </Button>
      </div>
    )
  }

  return <EventInfoLoaded event={event} onNavigate={onNavigate} />
}

function EventInfoLoaded({
  event,
  onNavigate,
}: {
  event: EventWithTiers
  onNavigate?: (page: string, data?: unknown) => void
}) {
  const remaining = listingRemaining(event)
  const status = eventListingStatus(event, remaining)
  const onSale = status === 'available' && eventOnSale(event.ticket_tiers)

  return (
    <div className="space-y-6 pb-24 pt-4">
      {event.cover_image_url && (
        <div
          className="mx-4 h-40 rounded-xl bg-cover bg-center"
          style={{ backgroundImage: `url(${event.cover_image_url})` }}
        />
      )}
      <div className="px-4">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h1 className="text-2xl font-bold">{event.title}</h1>
            <EventStatusBadge event={event} remaining={remaining} />
          </div>
          {event.description && <p className="mb-4 whitespace-pre-wrap text-muted-foreground">{event.description}</p>}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-primary" />
              <p className="font-semibold">{formatEventDateTime(event.start_time)}</p>
            </div>
            {(event.venue_name || event.venue_address) && (
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-primary" />
                <p className="font-semibold">
                  {event.venue_name}
                  {event.venue_address ? ` · ${event.venue_address}` : ''}
                </p>
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
          {status === 'ended' ? (
            <Button className="mt-6 w-full" type="button" disabled>
              This event has ended
            </Button>
          ) : onSale ? (
            <Button className="mt-6 w-full" onClick={() => (window.location.href = appCheckoutPath(event.slug))}>
              Buy ticket
            </Button>
          ) : (
            <Button className="mt-6 w-full" type="button" disabled>
              {status === 'sold_out' || event.ticket_tiers?.length ? 'Sold out' : 'Tickets not on sale'}
            </Button>
          )}
          <Button className="mt-2 w-full" variant="outline" onClick={() => onNavigate?.('events')}>
            Back to events
          </Button>
        </Card>

        <h2 className="mt-6 text-lg font-bold">Tickets</h2>
        <div className="mt-3 space-y-3">
          {(event.ticket_tiers ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">This event is not selling tickets online.</p>
          )}
          {(event.ticket_tiers ?? []).map((tier) => {
            const left = Math.max(0, Number(tier.quantity_total) - Number(tier.quantity_sold))
            return (
              <Card key={tier.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{tier.name}</h3>
                    {tier.description && <p className="text-sm text-muted-foreground">{tier.description}</p>}
                  </div>
                  <p className="text-lg font-bold text-primary">₦{Number(tier.price).toLocaleString()}</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {status === 'ended' ? 'Event ended' : left <= 0 ? 'Sold out' : `${left} remaining`}
                </p>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
