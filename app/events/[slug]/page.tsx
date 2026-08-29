import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isSupabaseConfigured } from '@/lib/env'
import { canViewEvent } from '@/lib/events/access'
import { fetchEventRowBySlug, liveRemaining, withLiveTiers } from '@/lib/events/live'
import { SiteFooter, SiteHeader } from '@/components/web/site-chrome'
import { Card } from '@/components/ui/card'
import { EventCountdown } from '@/components/web/event-countdown'
import { EventPurchaseCta } from '@/components/web/event-purchase-cta'
import { EventStatusBadge } from '@/components/event-status-badge'
import { eventCategoryLabel } from '@/lib/schemas/event'
import { eventDateHasPassed, listingRemaining } from '@/lib/events/sale'
import { formatEventSchedule } from '@/lib/datetime'
import { BU_SITE_NAME } from '@/lib/brand'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  if (!isSupabaseConfigured()) {
    return { title: BU_SITE_NAME }
  }
  const row = await fetchEventRowBySlug(slug)
  if (!row) return { title: BU_SITE_NAME }
  const record = withLiveTiers(row)
  const title = `${record.title} · ${BU_SITE_NAME}`
  const description = record.description || `Join ${record.title} on ${BU_SITE_NAME}`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: BU_SITE_NAME,
      images: [{ url: '/og.png', width: 1200, height: 630, alt: BU_SITE_NAME }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og.png'],
    },
  }
}

export default async function PublicEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!isSupabaseConfigured()) {
    return (
      <div className="theme-pink min-h-screen bg-background p-8 text-foreground">
        <p>Configure Supabase to load this event.</p>
      </div>
    )
  }

  const row = await fetchEventRowBySlug(slug)
  if (!row) notFound()
  const record = withLiveTiers(row)
  const allowed = await canViewEvent(record)
  if (!allowed) notFound()

  const ticketTiers = record.ticket_tiers

  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div
        className="h-64 bg-gradient-to-br from-primary via-primary/40 to-background bg-cover bg-center"
        style={record.cover_image_url ? { backgroundImage: `url(${record.cover_image_url})` } : undefined}
      />
      <main className="mx-auto -mt-20 max-w-5xl px-4 pb-16">
        <Card className="border-primary/20 p-6 md:p-10">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs uppercase tracking-widest text-primary">{eventCategoryLabel(record.category) ?? 'Celebration'}</p>
            <EventStatusBadge event={record} remaining={listingRemaining(record)} />
          </div>
          <h1 className="mt-2 text-4xl font-bold">{record.title}</h1>
          <p className="mt-3 text-muted-foreground" suppressHydrationWarning>
            {formatEventSchedule(record.start_time, record.end_time)}
          </p>
          <p className="mt-1 text-muted-foreground">
            {record.venue_name}
            {record.venue_address ? ` · ${record.venue_address}` : ''}
          </p>
          {record.venue_lat != null && record.venue_lng != null && (
            <a
              className="mt-2 inline-block text-sm text-primary"
              href={`https://maps.google.com/?q=${record.venue_lat},${record.venue_lng}`}
              target="_blank"
              rel="noreferrer"
            >
              Open map
            </a>
          )}
          <EventCountdown start={record.start_time} end={record.end_time} />
          <p className="mt-6 whitespace-pre-wrap">{record.description}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            Organised by {record.organizer_name ?? record.celebrant_name ?? 'ɃU organiser'}
          </p>
          <EventPurchaseCta
            startTime={record.start_time}
            endTime={record.end_time}
            remaining={listingRemaining(record)}
            slug={record.slug}
            title={record.title}
            hasTiers={ticketTiers.length > 0}
          />
        </Card>

        <h2 className="mt-10 text-2xl font-bold">Tickets</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {ticketTiers.length === 0 && (
            <p className="text-sm text-muted-foreground">This event is not selling tickets online.</p>
          )}
          {ticketTiers.map((tier) => {
            const remaining = liveRemaining(tier)
            return (
              <Card key={tier.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{tier.name}</h3>
                    <p className="text-sm text-muted-foreground">{tier.description ?? tier.benefits}</p>
                  </div>
                  <p className="text-xl font-bold text-primary">₦{Number(tier.price).toLocaleString()}</p>
                </div>
                <p className="mt-3 text-xs text-muted-foreground" suppressHydrationWarning>
                  {eventDateHasPassed(record) ? 'Event ended' : remaining <= 0 ? 'Sold out' : `${remaining} remaining`}
                </p>
              </Card>
            )
          })}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
