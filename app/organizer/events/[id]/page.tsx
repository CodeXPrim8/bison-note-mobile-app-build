'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DeleteEventButton } from '@/components/organizer/delete-event-button'

interface EventDash {
  event: {
    id: string
    title: string
    slug: string
    visibility: string
    status: string
    affiliate_enabled?: boolean
    affiliate_commission_pct?: number
  }
  stats: {
    tickets_sold: number
    revenue: number
    guests: number
    checked_in: number
    invited: number
    accepted: number
    pending: number
  }
  ticket_tiers: Array<{ id: string; name: string; price: number; quantity_sold: number; quantity_total: number }>
}

export default function EventDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<EventDash | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/events/${id}`, { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (cancelled) return
        if (json.status) {
          setData(json.data)
          setError(null)
          return
        }
        setError(json.message ?? 'Could not load this event')
        setData(null)
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load this event')
          setData(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-destructive">{error}</p>
        <Button asChild variant="outline">
          <Link href="/organizer/events">Back to events</Link>
        </Button>
      </div>
    )
  }

  if (!data) return <p className="text-muted-foreground">Loading event…</p>

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{data.event.title}</h1>
          <div className="mt-2 flex gap-2">
            <Badge>{data.event.visibility}</Badge>
            <Badge variant="outline">{data.event.status}</Badge>
            {data.event.affiliate_enabled ? (
              <Badge variant="outline">Affiliate {data.event.affiliate_commission_pct ?? 0}%</Badge>
            ) : (
              <Badge variant="outline">Affiliate off</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/organizer/events/${id}/edit`}>Edit event</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/events/${data.event.slug}`}>Public page</Link>
          </Button>
          <Button asChild>
            <Link href={`/organizer/events/${id}/checkin`}>Access</Link>
          </Button>
          <DeleteEventButton
            eventId={id}
            title={data.event.title}
            ticketsSold={data.stats.tickets_sold}
            size="default"
          />
        </div>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {Object.entries(data.stats).map(([key, value]) => (
          <Card key={key} className="p-4">
            <p className="text-xs uppercase text-muted-foreground">{key.replaceAll('_', ' ')}</p>
            <p className="mt-2 text-2xl font-bold">{typeof value === 'number' && key === 'revenue' ? `₦${value.toLocaleString()}` : value}</p>
          </Card>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild variant="outline"><Link href={`/organizer/events/${id}/tickets`}>Ticket sales</Link></Button>
        <Button asChild variant="outline"><Link href={`/organizer/events/${id}/guests`}>Guests & comments</Link></Button>
      </div>
      <h2 className="mt-10 font-semibold">Ticket types</h2>
      <div className="mt-3 space-y-2">
        {data.ticket_tiers.map((tier) => (
          <Card key={tier.id} className="flex items-center justify-between p-4">
            <span>{tier.name}</span>
            <span className="text-sm text-muted-foreground">
              {tier.quantity_sold}/{tier.quantity_total} · ₦{Number(tier.price).toLocaleString()}
            </span>
          </Card>
        ))}
      </div>
    </div>
  )
}
