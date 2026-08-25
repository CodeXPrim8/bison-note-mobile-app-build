'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, MapPin, Ticket, Users } from 'lucide-react'
import type { EventRecord, TicketTier } from '@/lib/types/database'

interface EventWithTiers extends EventRecord {
  ticket_tiers: TicketTier[]
}

interface EventInfoProps {
  eventId?: string
  onNavigate?: (page: string, data?: unknown) => void
}

export default function EventInfo({ eventId, onNavigate }: EventInfoProps) {
  const [event, setEvent] = useState<EventWithTiers | null>(null)
  const [related, setRelated] = useState<EventWithTiers[]>([])

  useEffect(() => {
    fetch('/api/events')
      .then(async (res) => {
        const json = (await res.json()) as { data?: EventWithTiers[] }
        const all = json.data ?? []
        const selected = all.find((item) => item.id === eventId) ?? all[0] ?? null
        setEvent(selected)
        setRelated(all.filter((item) => item.id !== selected?.id).slice(0, 3))
      })
      .catch(() => undefined)
  }, [eventId])

  if (!event) {
    return <p className="px-4 pt-6 text-muted-foreground">Loading event…</p>
  }

  const price = event.ticket_tiers[0] ? Number(event.ticket_tiers[0].price) : 0
  const available = event.ticket_tiers.reduce(
    (sum, tier) => sum + (tier.quantity_total - tier.quantity_sold),
    0,
  )

  return (
    <div className="space-y-6 pb-24 pt-4 px-4">
      <Card className="border-primary/20 p-6">
        <h1 className="text-2xl font-bold mb-2">{event.title}</h1>
        <p className="text-muted-foreground mb-4">{event.description}</p>
        <div className="space-y-3 text-sm">
          <p className="flex gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            {new Date(event.start_time).toLocaleString()}
          </p>
          {event.venue_name && (
            <p className="flex gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              {event.venue_name}
            </p>
          )}
          <p className="flex gap-2">
            <Ticket className="h-4 w-4 text-primary" />
            From ₦{price.toLocaleString()} · {available} left
          </p>
          {event.celebrant_name && (
            <p className="flex gap-2">
              <Users className="h-4 w-4 text-primary" />
              {event.celebrant_name}
            </p>
          )}
        </div>
        <Button className="w-full mt-6" onClick={() => (window.location.href = `/t/${event.slug}`)}>
          Buy Tickets
        </Button>
      </Card>
      {related.length > 0 && (
        <div>
          <h3 className="font-bold mb-3">More events</h3>
          <div className="space-y-2">
            {related.map((item) => (
              <Card
                key={item.id}
                className="p-4 cursor-pointer"
                onClick={() => onNavigate?.('event-info', item.id)}
              >
                <p className="font-semibold">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.venue_name}</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
