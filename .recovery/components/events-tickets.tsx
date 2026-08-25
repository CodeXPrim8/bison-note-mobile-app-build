'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar, MapPin, Ticket, Search } from 'lucide-react'
import type { EventRecord, TicketTier } from '@/lib/types/database'

interface EventWithTiers extends EventRecord {
  ticket_tiers: TicketTier[]
}

interface EventsTicketsProps {
  onNavigate?: (page: string, data?: unknown) => void
  initialData?: { action?: string; eventId?: string }
}

export default function EventsTickets({ onNavigate, initialData }: EventsTicketsProps) {
  const [events, setEvents] = useState<EventWithTiers[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/events')
      .then(async (res) => {
        const json = (await res.json()) as { status: boolean; data?: EventWithTiers[]; message?: string }
        if (json.status && json.data) setEvents(json.data)
        else setError(json.message ?? 'Could not load events')
      })
      .catch(() => setError('Could not load events'))
  }, [])

  useEffect(() => {
    if (initialData?.action === 'buy' && initialData.eventId) {
      const match = events.find((event) => event.id === initialData.eventId)
      if (match) window.location.href = `/t/${match.slug}`
    }
  }, [initialData, events])

  const filtered = events.filter((event) => {
    const q = searchQuery.toLowerCase()
    if (!q) return true
    return (
      event.title.toLowerCase().includes(q) ||
      (event.description ?? '').toLowerCase().includes(q) ||
      (event.venue_name ?? '').toLowerCase().includes(q)
    )
  })

  const lowestPrice = (event: EventWithTiers) => {
    const prices = event.ticket_tiers.map((tier) => Number(tier.price))
    return prices.length ? Math.min(...prices) : 0
  }

  const available = (event: EventWithTiers) =>
    event.ticket_tiers.reduce((sum, tier) => sum + (tier.quantity_total - tier.quantity_sold), 0)

  return (
    <div className="space-y-6 pb-24 pt-4">
      <div className="px-4">
        <h2 className="text-xl font-bold mb-4">Upcoming Events</h2>
        <Card className="border-primary/20 bg-card p-4 mb-4">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-primary" />
            <Input
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </Card>
        {error && <p className="text-sm text-destructive mb-3">{error}</p>}
        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No events found.</Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((event) => (
              <Card
                key={event.id}
                onClick={() => (onNavigate ? onNavigate('event-info', event.id) : (window.location.href = `/t/${event.slug}`))}
                className="border-primary/20 cursor-pointer bg-card p-4"
              >
                <div className="flex justify-between mb-2">
                  <h3 className="font-semibold">{event.title}</h3>
                  <span className="text-xs text-primary">
                    {new Date(event.start_time).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-primary" />
                    {event.venue_name}
                  </span>
                  <span className="font-bold text-primary">₦{lowestPrice(event).toLocaleString()}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Ticket className="h-3 w-3" />
                  {available(event)} available
                  <Calendar className="h-3 w-3 ml-2" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
