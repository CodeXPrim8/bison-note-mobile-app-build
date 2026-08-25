'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar, MapPin, Ticket, Search } from 'lucide-react'
import type { EventWithTiers } from '@/lib/types/database'

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
      .catch(() => setError('Could not load public events. Sign in and configure Supabase.'))
  }, [])

  useEffect(() => {
    if (initialData?.action === 'buy' && initialData.eventId) {
      const match = events.find((event) => event.id === initialData.eventId)
      if (match) window.location.href = `/checkout/${match.slug}`
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

  return (
    <div className="space-y-6 pb-24 pt-4">
      <div className="px-4">
        <h2 className="mb-4 text-xl font-bold">Upcoming Events</h2>
        <Card className="mb-4 border-primary/20 bg-card p-4">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-primary" />
            <Input placeholder="Search events..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </Card>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No public upcoming events.</Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((event) => (
              <Card
                key={event.id}
                onClick={() => (onNavigate ? onNavigate('event-info', event.id) : (window.location.href = `/events/${event.slug}`))}
                className="cursor-pointer border-primary/20 bg-card p-4"
              >
                <div className="mb-2 flex justify-between">
                  <h3 className="font-semibold">{event.title}</h3>
                  <span className="text-xs text-primary">{new Date(event.start_time).toLocaleDateString()}</span>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{event.description}</p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-primary" />
                    {event.venue_name}
                  </span>
                  <span className="font-bold text-primary">₦{Number(event.starting_price ?? 0).toLocaleString()}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Ticket className="h-3 w-3" />
                  {event.tickets_available ?? 0} available
                  <Calendar className="ml-2 h-3 w-3" />
                  {event.organizer_name ?? event.celebrant_name}
                </div>
              </Card>
            ))}
          </div>
        )}
        <Button className="mt-4 w-full" variant="outline" onClick={() => (window.location.href = '/events')}>
          Open full event site
        </Button>
      </div>
    </div>
  )
}
