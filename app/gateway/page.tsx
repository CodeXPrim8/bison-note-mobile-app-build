import Link from 'next/link'
import { SiteFooter, SiteHeader } from '@/components/web/site-chrome'
import { Card } from '@/components/ui/card'

export default function GatewayPage() {
  return (
    <div className="bu-site min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-16">
        <p className="bu-site-kicker">Ƀucks Gateway</p>
        <h1 className="bu-site-h2 mt-3">Keep your website. Take ticket money through Ƀucks.</h1>
        <p className="bu-site-copy mt-4 max-w-2xl">
          Your other site stores a Ƀucks secret key, starts a payment, redirects the guest, then verifies. Tickets land in Ƀucks Access.
        </p>
        <div className="bu-site-cta-row mt-8">
          <Link href="/gateway/dashboard" className="bu-site-btn bu-site-btn-primary">
            Get API keys
          </Link>
          <Link href="/gateway/docs" className="bu-site-btn bu-site-btn-ghost">
            API docs
          </Link>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            ['Secret key', 'sk_live_ on your server. POST initialize to start a payment.'],
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
