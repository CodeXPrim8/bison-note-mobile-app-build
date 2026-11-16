import { SiteFooter, SiteHeader } from '@/components/web/site-chrome'
import { PublicEventsGrid } from '@/components/web/public-events-grid'
import { AdSlot } from '@/components/web/ad-slot'

export default function EventsPage() {
  return (
    <div className="bu-site min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-12">
        <p className="bu-site-kicker">Calendar</p>
        <h1 className="bu-site-h2 mt-2">Upcoming events</h1>
        <p className="bu-site-copy">Public, published events also appear in the ɃU mobile app.</p>
        <div className="mt-6">
          <AdSlot slot="web_events" />
        </div>
        <div className="mt-8">
          <PublicEventsGrid />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
