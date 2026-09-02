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
        <h1 className="mt-3 text-4xl font-bold">Keep your website. Take ticket money through ɃU.</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Built like Paystack. Your other site stores a ɃU secret key, starts a payment, redirects the guest, then
          verifies. Paystack stays inside ɃU. Tickets land in ɃU Access.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild>
            <Link href="/gateway/dashboard">Get API keys</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/gateway/docs">API docs</Link>
          </Button>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            ['Secret key', 'sk_live_ on your server. POST initialize. Same pattern as Paystack.'],
            ['Public key', 'pk_live_ in a widget or hosted checkout. Never charges by itself.'],
            ['Verify + webhooks', 'GET verify/:reference. ticket.purchased signed with X-BU-Signature.'],
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
