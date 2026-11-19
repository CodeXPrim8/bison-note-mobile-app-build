'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Calendar, MapPin } from 'lucide-react'
import { formatEventDateTime } from '@/lib/datetime'
import VendorEvents from '@/components/vendor-events'

export interface Event {
  id: string
  name: string
  celebrantWalletId: string
  celebrantName: string
  vendorId: string
  vendorName: string
  status: 'active' | 'completed' | 'cancelled'
  createdAt: string
  eventDate: string
  location?: string
  totalBUReceived?: number
}

interface EventsProps {
  mode: 'guest' | 'vendor'
  onSelectEvent?: (event: Event) => void
}

export default function Events({ mode, onSelectEvent }: EventsProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [events, setEvents] = useState<Event[]>([])

  useEffect(() => {
    if (mode === 'vendor') return
    fetch('/api/events', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) {
          setEvents([])
          return
        }
        const list = (json.data ?? []) as Array<Record<string, unknown>>
        setEvents(
          list.map((event) => ({
            id: String(event.id),
            name: String(event.title ?? event.name ?? 'Event'),
            celebrantWalletId: String(event.organizer_id ?? ''),
            celebrantName: String(event.celebrant_name ?? event.organizer_name ?? ''),
            vendorId: String(event.merchant_id ?? ''),
            vendorName: String(event.venue_name ?? ''),
            status: 'active',
            createdAt: String(event.created_at ?? ''),
            eventDate: event.start_time ? formatEventDateTime(String(event.start_time)) : '',
            location: String(event.venue_name ?? event.venue_address ?? ''),
            totalBUReceived: Number(event.spray_budget_bu ?? 0),
          })),
        )
      })
      .catch(() => setEvents([]))
  }, [mode])

  if (mode === 'vendor') {
    return <VendorEvents />
  }

  const filteredEvents = events.filter((event) => {
    if (event.status !== 'active') return false
    const query = searchQuery.toLowerCase()
    return (
      event.name.toLowerCase().includes(query) ||
      event.celebrantName.toLowerCase().includes(query) ||
      event.location?.toLowerCase().includes(query)
    )
  })

  return (
    <div className="space-y-6 bg-transparent pb-28 pt-4 text-neutral-950">
      <div className="px-4">
        <h2 className="mb-4 text-lg font-semibold">Available events</h2>

        <div className="mb-4">
          <Input
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-2xl border-neutral-200 bg-neutral-50"
          />
        </div>

        <div className="space-y-2">
          {filteredEvents.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
              No active events found
            </div>
          ) : (
            filteredEvents.map((event) => (
              <button
                type="button"
                key={event.id}
                onClick={() => onSelectEvent?.(event)}
                className="bu-press w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-neutral-950">{event.name}</h4>
                    <p className="mt-1 text-sm text-neutral-500">Celebrant: {event.celebrantName}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {event.eventDate}
                      </span>
                      {event.location ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {event.location}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-neutral-950 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Active
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
