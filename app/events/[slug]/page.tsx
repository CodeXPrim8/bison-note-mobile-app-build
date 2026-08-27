import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isSupabaseConfigured } from '@/lib/env'
import { canViewEvent } from '@/lib/events/access'
import { fetchEventRowBySlug, liveRemaining, withLiveTiers } from '@/lib/events/live'
import { SiteFooter, SiteHeader } from '@/components/web/site-chrome'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EventCountdown } from '@/components/web/event-countdown'
import { EventShare } from '@/components/web/event-share'
import { eventCategoryLabel } from '@/lib/schemas/event'
import { isEventUpcoming } from '@/lib/events/sale'

export const dynamic = 'force-dynamic'

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
  const upcoming = isEventUpcoming(record)
  const onSale = upcoming && ticketTiers.some((tier) => tier.is_active && liveRemaining(tier) > 0)

  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div
        className="h-64 bg-gradient-to-br from-primary via-primary/40 to-background bg-cover bg-center"
        style={record.cover_image_url ? { backgroundImage: `url(${record.cover_image_url})` } : undefined}
      />
      <main className="mx-auto -mt-20 max-w-5xl px-4 pb-16">
        <Card className="border-primary/20 p-6 md:p-10">
          <p className="text-xs uppercase tracking-widest text-primary">{eventCategoryLabel(record.category) ?? 'Celebration'}</p>
          <h1 className="mt-2 text-4xl font-bold">{record.title}</h1>
          <p className="mt-3 text-muted-foreground">
            {new Date(record.start_time).toLocaleString()}
            {record.end_time ? ` – ${new Date(record.end_time).toLocaleTimeString()}` : ''}
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
          <div className="mt-6 flex flex-wrap gap-3">
            {!upcoming ? (
              <Button type="button" disabled>
                This event has ended
              </Button>
            ) : onSale ? (
              <Button asChild>
                <Link href={`/checkout/${record.slug}`}>Buy ticket</Link>
              </Button>
            ) : (
              <Button type="button" disabled>
                {ticketTiers.length ? 'Sold out' : 'Tickets not on sale'}
              </Button>
            )}
            <EventShare title={record.title} slug={record.slug} />
          </div>
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
                <p className="mt-3 text-xs text-muted-foreground">
                  {remaining <= 0 ? 'Sold out' : `${remaining} remaining`}
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
