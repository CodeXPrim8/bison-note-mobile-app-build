'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar, MapPin, Search } from 'lucide-react'
import { eventDateHasPassed, isUpcomingListingEvent, listingRemaining } from '@/lib/events/sale'
import { formatEventDate } from '@/lib/datetime'
import { eventVenueLabel } from '@/lib/events/event-details'
import { EventStatusBadge } from '@/components/event-status-badge'
import { EventTicketList } from '@/components/event-ticket-list'
import type { EventWithTiers } from '@/lib/types/database'
import { readSessionSnapshot, writeSessionSnapshot } from '@/lib/session-snapshot'

interface EventsTicketsProps {
  onNavigate?: (page: string, data?: unknown) => void
  initialData?: { action?: string; eventId?: string }
}

export default function EventsTickets({ onNavigate, initialData }: EventsTicketsProps) {
  const cached = readSessionSnapshot<EventWithTiers[]>('bu_public_events')
  const [events, setEvents] = useState<EventWithTiers[]>(cached ?? [])
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(Boolean(cached))

  useEffect(() => {
    fetch('/api/events', { credentials: 'include' })
      .then(async (res) => {
        const json = (await res.json()) as { status: boolean; data?: EventWithTiers[]; message?: string }
        if (json.status && json.data) {
          setEvents(json.data)
          writeSessionSnapshot('bu_public_events', json.data)
        } else setError(json.message ?? 'Could not load events')
        setReady(true)
      })
      .catch(() => {
        setError('Could not load public events. Sign in and configure Supabase.')
        setReady(true)
      })
  }, [])

  useEffect(() => {
    if (initialData?.action === 'buy' && initialData.eventId) {
      const match = events.find((event) => event.id === initialData.eventId)
      if (match) window.location.href = `/checkout/${match.slug}?from=app`
    }
  }, [initialData, events])

  const filtered = events.filter((event) => {
    if (!isUpcomingListingEvent(event)) return false
    const q = searchQuery.toLowerCase()
    if (!q) return true
    return (
      event.title.toLowerCase().includes(q) ||
      (event.description ?? '').toLowerCase().includes(q) ||
      (eventVenueLabel(event) ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6 bg-transparent pb-28 pt-4 text-neutral-950">
      <div className="px-4">
        <h2 className="mb-4 text-lg font-semibold">Upcoming events</h2>
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-neutral-500" />
          <Input
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
        </div>
        {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}
        {filtered.length === 0 ? (
          ready ? (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
              No public upcoming events.
            </div>
          ) : null
        ) : (
          <div className="space-y-2">
            {filtered.map((event) => (
              <button
                type="button"
                key={event.id}
                onClick={() => (onNavigate ? onNavigate('event-info', event.id) : (window.location.href = `/events/${event.slug}`))}
                className="bu-press w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-left"
              >
                <div className="mb-2 flex justify-between gap-2">
                  <h3 className="font-semibold text-neutral-950">{event.title}</h3>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs font-medium text-neutral-600">{formatEventDate(event.start_time)}</span>
                    <EventStatusBadge event={event} remaining={listingRemaining(event)} />
                  </div>
                </div>
                <p className="line-clamp-2 text-sm text-neutral-500">{event.description}</p>
                <div className="mt-2 flex items-center gap-1 text-sm text-neutral-700">
                  <MapPin className="h-4 w-4 text-neutral-950" />
                  {eventVenueLabel(event)}
                </div>
                <div className="mt-3">
                  <EventTicketList tiers={event.ticket_tiers} ended={eventDateHasPassed(event)} />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
                  <Calendar className="h-3 w-3" />
                  {event.organizer_name ?? event.celebrant_name}
                </div>
              </button>
            ))}
          </div>
        )}
        <Button
          className="mt-4 w-full rounded-full border-neutral-200"
          variant="outline"
          onClick={() => (window.location.href = '/events')}
        >
          Open full event site
        </Button>
      </div>
    </div>
  )
}
