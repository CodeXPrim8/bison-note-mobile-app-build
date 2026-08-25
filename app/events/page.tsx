import { SiteFooter, SiteHeader } from '@/components/web/site-chrome'
import { PublicEventsGrid } from '@/components/web/public-events-grid'

export default function EventsPage() {
  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-4xl font-bold">Upcoming events</h1>
        <p className="mt-2 text-muted-foreground">Public, published events also appear in the ɃU mobile app.</p>
        <div className="mt-8">
          <PublicEventsGrid />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
