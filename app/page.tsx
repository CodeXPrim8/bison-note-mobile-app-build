import Link from 'next/link'
import { SiteFooter, SiteHeader } from '@/components/web/site-chrome'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PublicEventsGrid } from '@/components/web/public-events-grid'

export default function WebsiteHome() {
  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <SiteHeader />
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/25 via-background to-background" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-28">
          <p className="mb-4 text-sm font-semibold tracking-[0.2em] text-primary uppercase">ɃU Event Platform</p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
            Create Events.
            <br />
            Sell Tickets.
            <br />
            Celebrate with ɃU.
          </h1>
          <div className="mt-6 max-w-xl space-y-4 text-lg text-muted-foreground">
            <p>
              Create and manage your event, sell tickets online, invite your guests and check them in—all in one place.
            </p>
            <p>
              From weddings and birthdays to parties, concerts and special events, ɃU makes event ticketing simple for
              organisers and guests.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/organizer/events/create">Create your event</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/events">Explore events</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="/app">Open ɃU app</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-3xl font-bold">Upcoming events</h2>
            <p className="text-muted-foreground">Public events appear here and inside the ɃU app.</p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/events">View all</Link>
          </Button>
        </div>
        <PublicEventsGrid limit={6} />
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 md:grid-cols-2 lg:grid-cols-4">
        {[
          { title: 'Create your event', body: 'Weddings, concerts, club nights, conferences — publish in minutes.' },
          { title: 'Private invites', body: 'Invite guests by ɃU ID. Private events never hit Upcoming Events.' },
          { title: 'Ticketing', body: 'Name ticket types and set a price and quantity for each. Buyers choose Regular, VIP, Table, and so on at checkout.' },
          { title: 'QR check-in', body: 'Scan at the gate. Valid, already used, refunded — decided server-side.' },
        ].map((item) => (
          <Card key={item.title} className="border-primary/20 p-6">
            <h3 className="font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
          </Card>
        ))}
      </section>

      <section className="border-y border-border/80 bg-card/40 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold">How it works</h2>
            <ol className="mt-6 space-y-4 text-muted-foreground">
              <li>1. Organiser creates a PUBLIC or PRIVATE event.</li>
              <li>2. Guests discover it in Upcoming Events or Invites.</li>
              <li>3. After payment, ɃU issues tickets with a QR and backup code, and emails them to the buyer.</li>
              <li>4. Tickets also appear in the ɃU app. Staff authenticate at the door.</li>
            </ol>
          </div>
          <div>
            <h2 className="text-3xl font-bold">ɃU Gateway</h2>
            <p className="mt-4 text-muted-foreground">
              Keep your own website. Use ɃU for ticketing and delivering tickets to guests.
            </p>
            <Button asChild className="mt-6">
              <Link href="/gateway">Developer docs & keys</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <Card className="border-primary/30 bg-gradient-to-br from-primary/20 to-background p-8 md:p-12">
          <h2 className="text-3xl font-bold">Open the ɃU app</h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Wallet, spraying, invites, tickets, and withdrawals — one ɃU account across web and mobile. Physical Bison
            Notes stay ceremonial. Value lives in the wallet.
          </p>
          <Button asChild className="mt-6">
            <Link href="/app">Open ɃU app</Link>
          </Button>
        </Card>
      </section>
      <SiteFooter />
    </div>
  )
}
