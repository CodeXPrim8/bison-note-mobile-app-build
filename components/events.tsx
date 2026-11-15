'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar, MapPin, Plus, X } from 'lucide-react'
import { formatEventDateTime } from '@/lib/datetime'
import { buFromNaira, formatBu } from '@/lib/bu-rate'

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
  onCreateEvent?: (event: Omit<Event, 'id' | 'createdAt' | 'status'>) => void
}

export default function Events({ mode, onSelectEvent, onCreateEvent }: EventsProps) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  const [events, setEvents] = useState<Event[]>([])

  useEffect(() => {
    const path = mode === 'vendor' ? '/api/events/mine' : '/api/events'
    fetch(path, { credentials: 'include' })
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

  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newEvent, setNewEvent] = useState({
    name: '',
    celebrantWalletId: '',
    celebrantName: '',
    eventDate: '',
    location: '',
  })

  const filteredEvents = events.filter((event) => {
    if (event.status !== 'active') return false
    const query = searchQuery.toLowerCase()
    return (
      event.name.toLowerCase().includes(query) ||
      event.celebrantName.toLowerCase().includes(query) ||
      event.location?.toLowerCase().includes(query)
    )
  })

  const handleCreateEvent = async () => {
    if (!newEvent.name || !newEvent.eventDate) {
      setCreateError('Event name and date are required.')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const start = new Date(newEvent.eventDate)
      const res = await fetch('/api/events', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEvent.name,
          celebrant_name: newEvent.celebrantName || null,
          venue_name: newEvent.location || null,
          start_time: Number.isFinite(start.getTime()) ? start.toISOString() : newEvent.eventDate,
          visibility: 'PUBLIC',
          status: 'published',
          ticket_tiers: [{ name: 'General', price: 0, quantity_total: 0 }],
        }),
      })
      const json = await res.json()
      setCreating(false)
      if (!json.status) {
        setCreateError(json.message ?? 'Could not create this event.')
        return
      }
      onCreateEvent?.({
        name: newEvent.name,
        celebrantWalletId: newEvent.celebrantWalletId,
        celebrantName: newEvent.celebrantName,
        vendorId: '',
        vendorName: '',
        eventDate: newEvent.eventDate,
        location: newEvent.location,
      })
      setShowCreateForm(false)
      setNewEvent({ name: '', celebrantWalletId: '', celebrantName: '', eventDate: '', location: '' })
      const listRes = await fetch('/api/events/mine', { credentials: 'include' })
      const listJson = await listRes.json()
      const list = (listJson.data ?? []) as Array<Record<string, unknown>>
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
    } catch {
      setCreating(false)
      setCreateError('Could not reach ɃU.')
    }
  }

  if (mode === 'vendor') {
    return (
      <div className="space-y-4 bg-transparent pb-4 text-neutral-950">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-neutral-950">Manage events</h2>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="bu-press inline-flex items-center gap-1.5 rounded-full bg-neutral-950 px-3 py-2 text-xs font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Create
          </button>
        </div>

        {showCreateForm && (
          <div className="mb-2 rounded-[24px] border border-neutral-200 bg-neutral-50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Create new event</h3>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded-full p-1.5 text-neutral-500 hover:bg-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-neutral-600">Event name</label>
                <Input
                  placeholder="Event name"
                  value={newEvent.name}
                  onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                  className="mt-1.5 rounded-2xl border-neutral-200 bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-600">Celebrant name</label>
                <Input
                  placeholder="Enter celebrant's full name"
                  value={newEvent.celebrantName}
                  onChange={(e) => setNewEvent({ ...newEvent, celebrantName: e.target.value })}
                  className="mt-1.5 rounded-2xl border-neutral-200 bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-600">Celebrant wallet ID</label>
                <Input
                  placeholder="Enter celebrant's wallet ID"
                  value={newEvent.celebrantWalletId}
                  onChange={(e) => setNewEvent({ ...newEvent, celebrantWalletId: e.target.value })}
                  className="mt-1.5 rounded-2xl border-neutral-200 bg-white"
                />
                <p className="mt-1 text-[11px] text-neutral-500">
                  Link the celebrant&apos;s wallet to receive ɃU transfers
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-600">Event date</label>
                <Input
                  type="date"
                  value={newEvent.eventDate}
                  onChange={(e) => setNewEvent({ ...newEvent, eventDate: e.target.value })}
                  className="mt-1.5 rounded-2xl border-neutral-200 bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-600">Location (optional)</label>
                <Input
                  placeholder="e.g. Lagos, Nigeria"
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  className="mt-1.5 rounded-2xl border-neutral-200 bg-white"
                />
              </div>

              {createError ? <p className="text-sm text-rose-600">{createError}</p> : null}
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={() => void handleCreateEvent()}
                  disabled={creating}
                  className="flex-1 rounded-full bg-neutral-950 text-white hover:bg-neutral-800"
                >
                  {creating ? 'Saving…' : 'Create event'}
                </Button>
                <Button
                  onClick={() => setShowCreateForm(false)}
                  variant="outline"
                  className="flex-1 rounded-full border-neutral-200"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {events.length === 0 ? (
            <p className="text-sm text-neutral-500">No events yet.</p>
          ) : null}
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-sm font-semibold text-neutral-950">{event.name}</h4>
                <p className="mt-0.5 text-xs text-neutral-500">Celebrant: {event.celebrantName}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-neutral-500">
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
                <span
                  className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    event.status === 'active'
                      ? 'bg-emerald-100 text-emerald-700'
                      : event.status === 'completed'
                        ? 'bg-neutral-200 text-neutral-600'
                        : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {event.status}
                </span>
              </div>
              {event.totalBUReceived !== undefined ? (
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-neutral-950">
                    Ƀ {formatBu(buFromNaira(event.totalBUReceived))}
                  </p>
                  <p className="text-[11px] text-neutral-500">Received</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Guest mode - Event browser
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
