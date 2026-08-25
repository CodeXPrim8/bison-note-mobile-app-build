'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar, MapPin, Plus, X } from 'lucide-react'

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
            eventDate: event.start_time ? new Date(String(event.start_time)).toLocaleString() : '',
            location: String(event.venue_name ?? event.venue_address ?? ''),
            totalBUReceived: Number(event.spray_budget_bu ?? 0),
          })),
        )
      })
      .catch(() => undefined)
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
          eventDate: event.start_time ? new Date(String(event.start_time)).toLocaleString() : '',
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
      <div className="space-y-6 pb-24 pt-4">
        <div className="px-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Manage Events</h2>
            <Button
              onClick={() => setShowCreateForm(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Event
            </Button>
          </div>

          {showCreateForm && (
            <Card className="border-primary/20 bg-card p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Create New Event</h3>
                <Button
                  onClick={() => setShowCreateForm(false)}
                  variant="ghost"
                  size="sm"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold">Event Name</label>
                  <Input
                    placeholder="Event name"
                    value={newEvent.name}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, name: e.target.value })
                    }
                    className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold">Celebrant Name</label>
                  <Input
                    placeholder="Enter celebrant's full name"
                    value={newEvent.celebrantName}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, celebrantName: e.target.value })
                    }
                    className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold">Celebrant Wallet ID</label>
                  <Input
                    placeholder="Enter celebrant's wallet ID"
                    value={newEvent.celebrantWalletId}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, celebrantWalletId: e.target.value })
                    }
                    className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Link the celebrant's wallet to receive ɃU transfers
                  </p>
                </div>

                <div>
                  <label className="text-sm font-semibold">Event Date</label>
                  <Input
                    type="date"
                    value={newEvent.eventDate}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, eventDate: e.target.value })
                    }
                    className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold">Location (Optional)</label>
                  <Input
                    placeholder="e.g. Lagos, Nigeria"
                    value={newEvent.location}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, location: e.target.value })
                    }
                    className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                {createError && <p className="text-sm text-destructive">{createError}</p>}
                <div className="flex gap-2">
                  <Button
                    onClick={() => void handleCreateEvent()}
                    disabled={creating}
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {creating ? 'Saving…' : 'Create Event'}
                  </Button>
                  <Button
                    onClick={() => setShowCreateForm(false)}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          )}

          <div className="space-y-3">
            {events.length === 0 && (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            )}
            {events.map((event) => (
                <Card
                  key={event.id}
                  className="border-border/50 bg-card/50 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold">{event.name}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Celebrant: {event.celebrantName}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {event.eventDate}
                        </span>
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {event.location}
                          </span>
                        )}
                      </div>
                      <span
                        className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-semibold ${
                          event.status === 'active'
                            ? 'bg-green-400/20 text-green-400'
                            : event.status === 'completed'
                              ? 'bg-gray-400/20 text-gray-400'
                              : 'bg-red-400/20 text-red-400'
                        }`}
                      >
                        {event.status}
                      </span>
                    </div>
                    {event.totalBUReceived !== undefined && (
                      <div className="text-right">
                        <p className="font-bold text-primary">
                          Ƀ {event.totalBUReceived.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">Received</p>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
          </div>
        </div>
      </div>
    )
  }

  // Guest mode - Event browser
  return (
    <div className="space-y-6 pb-24 pt-4">
      <div className="px-4">
        <h2 className="text-xl font-bold mb-4">Available Events</h2>

        {/* Search */}
        <div className="mb-4">
          <Input
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-secondary text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Events List */}
        <div className="space-y-3">
          {filteredEvents.length === 0 ? (
            <Card className="border-border/50 bg-card/50 p-8 text-center">
              <p className="text-muted-foreground">No active events found</p>
            </Card>
          ) : (
            filteredEvents.map((event) => (
              <Card
                key={event.id}
                onClick={() => onSelectEvent && onSelectEvent(event)}
                className="border-primary/20 cursor-pointer bg-card p-4 transition hover:bg-card/80 hover:border-primary/40"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold">{event.name}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Celebrant: {event.celebrantName}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {event.eventDate}
                      </span>
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {event.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full bg-primary/20 px-2 py-1 text-xs text-primary font-semibold">
                      Active
                    </span>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
