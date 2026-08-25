import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { PublicShell } from '@/components/public-shell'
import { Countdown } from '@/components/tickets/countdown'
import { TicketCheckoutForm } from '@/components/tickets/ticket-checkout-form'
import { getAppUrl } from '@/lib/env'
import type { EventRecord, TicketTier } from '@/lib/types/database'

interface Props {
  params: Promise<{ slug: string }>
}

async function loadEvent(slug: string) {
  const admin = createAdminClient()
  const { data: event } = await admin.from('events').select('*').eq('slug', slug).maybeSingle()
  if (!event) return null
  const record = event as EventRecord
  const { data: tiers } = await admin.from('ticket_tiers').select('*').eq('event_id', record.id)
  return { event: record, tiers: (tiers as TicketTier[]) ?? [] }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const loaded = await loadEvent(slug)
    if (!loaded) return { title: 'Event · BU' }
    const url = `${getAppUrl()}/t/${slug}`
    return {
      title: `${loaded.event.title} · BU Tickets`,
      description: loaded.event.description ?? `Get tickets for ${loaded.event.title}`,
      openGraph: {
        title: loaded.event.title,
        description: loaded.event.description ?? undefined,
        url,
        images: loaded.event.cover_image_url ? [loaded.event.cover_image_url] : undefined,
      },
      twitter: {
        card: 'summary_large_image',
        title: loaded.event.title,
        description: loaded.event.description ?? undefined,
      },
    }
  } catch {
    return { title: 'Event · BU' }
  }
}

export default async function TicketPage({ params }: Props) {
  const { slug } = await params
  let loaded: { event: EventRecord; tiers: TicketTier[] } | null = null
  try {
    loaded = await loadEvent(slug)
  } catch {
    loaded = null
  }
  if (!loaded || loaded.event.status === 'cancelled') notFound()

  const { event, tiers } = loaded
  const appUrl = getAppUrl()
  const mapsUrl =
    event.venue_lat && event.venue_lng
      ? `https://www.openstreetmap.org/?mlat=${event.venue_lat}&mlon=${event.venue_lng}#map=16/${event.venue_lat}/${event.venue_lng}`
      : null
  const widgetSnippet = `<script src="${appUrl}/widget/bu-widget.js" data-event-slug="${event.slug}" data-button-text="Buy tickets" async></script>`
  const iframeSnippet = `<iframe src="${appUrl}/t/${event.slug}" style="width:100%;min-height:720px;border:0;border-radius:16px"></iframe>`

  return (
    <PublicShell title="Tickets">
      <div className="pb-28">
        <div
          className="relative h-56 bg-gradient-to-br from-primary to-primary/40"
          style={
            event.cover_image_url
              ? { backgroundImage: `url(${event.cover_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : undefined
          }
        >
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute bottom-4 left-4 right-4 text-white">
            <p className="text-xs uppercase tracking-wide opacity-80">Countdown</p>
            <p className="text-2xl font-bold">
              <Countdown target={event.start_time} />
            </p>
          </div>
        </div>

        <div className="px-4 -mt-6 space-y-4">
          <div className="rounded-2xl bg-card p-4 border border-border">
            <h1 className="text-2xl font-bold">{event.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {event.celebrant_name ? `Hosted by ${event.celebrant_name}` : 'Powered by BU'}
            </p>
            <p className="text-sm mt-3">{event.description}</p>
            <div className="mt-3 text-sm text-muted-foreground space-y-1">
              <p>{new Date(event.start_time).toLocaleString()}</p>
              {event.venue_name && (
                <p>
                  {mapsUrl ? (
                    <a className="text-primary underline" href={mapsUrl} target="_blank" rel="noreferrer">
                      {event.venue_name}
                    </a>
                  ) : (
                    event.venue_name
                  )}
                </p>
              )}
            </div>
          </div>

          <TicketCheckoutForm eventSlug={event.slug} eventId={event.id} eventTitle={event.title} tiers={tiers} />

          <div className="rounded-xl border border-border p-4 text-xs space-y-2">
            <p className="font-semibold">Share / embed</p>
            <button
              className="text-primary"
              formAction={undefined}
            >
              Copy link: {appUrl}/t/{event.slug}
            </button>
            <pre className="overflow-x-auto rounded bg-secondary p-2 whitespace-pre-wrap">{widgetSnippet}</pre>
            <pre className="overflow-x-auto rounded bg-secondary p-2 whitespace-pre-wrap">{iframeSnippet}</pre>
          </div>

          <p className="text-center text-[11px] text-muted-foreground pb-4">Powered by BU</p>
        </div>
      </div>
    </PublicShell>
  )
}
