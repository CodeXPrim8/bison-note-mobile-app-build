'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PublicShell } from '@/components/public-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { EventRecord } from '@/lib/types/database'

interface EventStats extends EventRecord {
  tickets_sold: number
  revenue: number
  checkin_rate: number
}

export default function OrganizerEventsPage() {
  const [events, setEvents] = useState<EventStats[]>([])
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/events/mine')
    const json = (await res.json()) as { status: boolean; message?: string; data?: EventStats[] }
    if (!json.status) {
      setMessage(json.message ?? 'Sign in as an organizer to see events.')
      setEvents([])
      return
    }
    setEvents(json.data ?? [])
    setMessage(null)
  }

  useEffect(() => {
    load().catch(() => setMessage('Could not load events'))
  }, [])

  const totals = useMemo(
    () => ({
      sold: events.reduce((sum, event) => sum + event.tickets_sold, 0),
      revenue: events.reduce((sum, event) => sum + event.revenue, 0),
      checkin: events.length
        ? events.reduce((sum, event) => sum + event.checkin_rate, 0) / events.length
        : 0,
    }),
    [events],
  )

  return (
    <PublicShell title="Organizer">
      <div className="px-4 py-6 space-y-4 pb-16">
        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Sold</p>
            <p className="text-lg font-bold">{totals.sold}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Revenue</p>
            <p className="text-lg font-bold">₦{totals.revenue.toLocaleString()}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Check-in</p>
            <p className="text-lg font-bold">{Math.round(totals.checkin * 100)}%</p>
          </Card>
        </div>
        <Button asChild className="w-full">
          <Link href="/dashboard/events/create">Create event</Link>
        </Button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        {events.map((event) => (
          <Card key={event.id} className="p-4 space-y-2">
            <div className="flex justify-between">
              <h3 className="font-semibold">{event.title}</h3>
              <span className="text-xs capitalize">{event.status}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {event.tickets_sold} sold · ₦{event.revenue.toLocaleString()} ·{' '}
              {Math.round(event.checkin_rate * 100)}% in
            </p>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/t/${event.slug}`}>Ticket page</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/checkin/${event.id}`}>Check-in</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/dashboard/events/${event.id}/attendees`}>Attendees</Link>
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </PublicShell>
  )
}
