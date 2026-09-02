'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AdSlot } from '@/components/web/ad-slot'
import { AreaChart, BarChart } from '@/components/web/area-chart'
import { formatNaira } from '@/lib/money'
import { formatEventDateTime } from '@/lib/datetime'
import { DeleteEventButton } from '@/components/organizer/delete-event-button'

interface EventStat {
  id: string
  title: string
  slug: string
  start_time: string
  venue: string
  cover_image_url: string | null
  status: string
  visibility: string
  upcoming: boolean
  tickets_sold: number
  revenue: number
  credits: number
  guests: number
  checked_in: number
  remaining: number
}

interface Stats {
  total_events: number
  tickets_sold: number
  total_revenue: number
  wallet_naira?: number
  organiser_credits?: number
  recent_credits?: Array<Record<string, unknown>>
  upcoming_events: number
  total_guests: number
  checked_in: number
  events?: EventStat[]
  series?: Array<{ key: string; label: string; count: number; naira: number }>
  credit_series?: Array<{ key: string; label: string; organiser: number }>
  generated_at?: string
}

export default function OrganizerHome() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/organizer/stats', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (json.status) {
          setStats(json.data)
          setError(null)
          setUpdatedAt(new Date().toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', second: '2-digit' }))
        } else setError(json.message)
      })
      .catch(() => setError('Sign in as an organiser to load this dashboard.'))
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 20000)
    return () => window.clearInterval(timer)
  }, [load])

  const cards = [
    ['ɃU wallet', stats ? formatNaira(Number(stats.wallet_naira ?? 0)) : '—'],
    ['Ticket credits', stats ? formatNaira(Number(stats.organiser_credits ?? 0)) : '—'],
    ['Total Events', stats?.total_events ?? '—'],
    ['Tickets Sold', stats?.tickets_sold ?? '—'],
    ['Total Revenue', stats ? formatNaira(stats.total_revenue) : '—'],
    ['Upcoming Events', stats?.upcoming_events ?? '—'],
    ['Total Guests', stats?.total_guests ?? '—'],
    ['Checked In', stats?.checked_in ?? '—'],
  ]

  const ticketPoints = useMemo(() => stats?.series?.map((item) => item.count) ?? [], [stats])
  const revenuePoints = useMemo(() => stats?.series?.map((item) => item.naira) ?? [], [stats])
  const creditPoints = useMemo(() => stats?.credit_series?.map((item) => item.organiser) ?? [], [stats])
  const eventBars = useMemo(() => (stats?.events ?? []).slice(0, 10).map((event) => event.revenue), [stats])
  const peakTickets = Math.max(...ticketPoints, 0)
  const peakRevenue = Math.max(...revenuePoints, 0)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live view of every event you created
            {updatedAt ? ` · updated ${updatedAt}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/app?page=redemption">Withdraw</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/affiliate">Affiliate</Link>
          </Button>
          <Button asChild>
            <Link href="/organizer/events/create">Create event</Link>
          </Button>
        </div>
      </div>
      <div className="mt-6">
        <AdSlot slot="organizer_home" />
      </div>
      {error && (
        <p className="mt-4 text-sm text-muted-foreground">
          {error} <Link href="/login" className="text-primary">Sign in</Link>
        </p>
      )}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label} className="p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden border-white/10 p-0 lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <p className="font-semibold">Ticket sales, last 14 days</p>
              <p className="text-xs text-muted-foreground">
                Peak {peakTickets} tickets in a day · live, refreshes every 20s
              </p>
            </div>
          </div>
          <div className="px-2 pb-2 pt-4">
            <AreaChart points={ticketPoints.length ? ticketPoints : [0, 0]} accent="#f43f5e" />
          </div>
          <div className="flex justify-between px-5 pb-4 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>{stats?.series?.[0]?.label}</span>
            <span>{stats?.series?.at(-1)?.label}</span>
          </div>
        </Card>
        <Card className="p-5">
          <p className="font-semibold">Revenue by day</p>
          <p className="mb-4 text-xs text-muted-foreground">Peak {formatNaira(peakRevenue)}</p>
          <BarChart values={revenuePoints.length ? revenuePoints : [0]} accent="#f43f5e" />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <p className="font-semibold">Revenue by event</p>
          <p className="mb-4 text-xs text-muted-foreground">Each bar is one of your events</p>
          <BarChart values={eventBars.length ? eventBars : [0]} accent="#fb7185" />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {(stats?.events ?? []).slice(0, 10).map((event) => (
              <span key={event.id}>
                {event.title} · {formatNaira(event.revenue)}
              </span>
            ))}
          </div>
        </Card>
        <Card className="overflow-hidden border-white/10 p-0">
          <div className="px-5 pt-5">
            <p className="font-semibold">Wallet credits, last 14 days</p>
            <p className="text-xs text-muted-foreground">Ticket money that landed on this account</p>
          </div>
          <div className="px-2 pb-2 pt-4">
            <AreaChart points={creditPoints.length ? creditPoints : [0, 0]} accent="#34d399" />
          </div>
        </Card>
      </div>

      <div className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Your events</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Numbers for each event, not only the totals above.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/organizer/events">Manage events</Link>
          </Button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(stats?.events ?? []).map((event) => (
            <Card key={event.id} className="overflow-hidden border-white/10 p-0">
              <div
                className="h-28 bg-gradient-to-br from-primary/40 to-background bg-cover bg-center"
                style={event.cover_image_url ? { backgroundImage: `url(${event.cover_image_url})` } : undefined}
              />
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatEventDateTime(event.start_time)}
                      {event.venue ? ` · ${event.venue}` : ''}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] uppercase tracking-wider text-primary">
                    {event.upcoming ? 'Upcoming' : 'Ended'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Sold</p>
                    <p className="font-semibold">{event.tickets_sold}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Revenue</p>
                    <p className="font-semibold">{formatNaira(event.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Checked in</p>
                    <p className="font-semibold">{event.checked_in}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Left</p>
                    <p className="font-semibold">{event.remaining}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm" className="flex-1">
                    <Link href={`/organizer/events/${event.id}`}>Open event</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/organizer/events/${event.id}/edit`}>Edit</Link>
                  </Button>
                  <DeleteEventButton
                    eventId={event.id}
                    title={event.title}
                    ticketsSold={event.tickets_sold}
                    redirectTo={null}
                    onDeleted={load}
                  />
                </div>
              </div>
            </Card>
          ))}
          {stats && (stats.events ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No events yet. Create one to see its sales here.</p>
          )}
        </div>
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Ticket credits</h2>
          <Button asChild variant="outline" size="sm">
            <Link href="/organizer/transactions">All transactions</Link>
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Newest first. When a guest pays, the ticket price (minus affiliate commission) lands on this wallet.
        </p>
        <div className="mt-4 space-y-2">
          {(stats?.recent_credits ?? []).map((row) => (
            <Card key={String(row.id)} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">Ticket sale</p>
                <p className="text-xs text-muted-foreground">
                  {String(row.created_at ?? '').replace('T', ' ').slice(0, 16)}
                </p>
              </div>
              <p className="font-semibold">₦{Number(row.naira || 0).toLocaleString()}</p>
            </Card>
          ))}
          {stats && (stats.recent_credits ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No ticket credits yet. They appear after a guest pays.</p>
          )}
        </div>
      </div>
    </div>
  )
}
