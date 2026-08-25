import Link from 'next/link'
import { SiteFooter, SiteHeader } from '@/components/web/site-chrome'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function GatewayPage() {
  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">ɃU Gateway</p>
        <h1 className="mt-3 text-4xl font-bold">Keep your website. Use ɃU for tickets.</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Third-party event sites initialize a purchase, redirect to ɃU checkout, Paystack confirms, ɃU issues tickets,
          and buyers with a ɃU account see them in the mobile app.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild>
            <Link href="/gateway/dashboard">Merchant dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/gateway/docs">Developer docs</Link>
          </Button>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            ['API keys', 'public_key and secret_key. Secret shown only at creation.'],
            ['Hosted checkout', 'Redirect buyers to ɃU. Never trust frontend prices.'],
            ['Webhooks', 'ticket.purchased, ticket.checked_in, payment.failed, event.sold_out.'],
          ].map(([title, body]) => (
            <Card key={title} className="p-6">
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </Card>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
