import { SiteFooter, SiteHeader } from '@/components/web/site-chrome'
import { Card } from '@/components/ui/card'

export default function GatewayDocs() {
  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-4xl font-bold">ɃU Gateway docs</h1>
        <p className="mt-3 text-muted-foreground">Base URL: <code>/api/v1/gateway</code>. Authenticate with <code>Authorization: Bearer sk_...</code>.</p>
        <Card className="mt-8 space-y-4 p-6 text-sm">
          <p><code>POST /merchants/register</code> — create keys (session optional)</p>
          <p><code>POST /events</code> — create an event + tiers</p>
          <p><code>GET /events/:event_id</code></p>
          <p><code>GET /events/:event_id/stats</code></p>
          <p><code>POST /tickets/initialize</code> — returns authorization_url + reference</p>
          <p><code>GET /tickets/verify/:reference</code> — server-side Paystack verify</p>
          <p><code>POST /webhooks</code> — register merchant webhook URL</p>
        </Card>
        <p className="mt-6 text-sm text-muted-foreground">
          Authenticate with <code>Authorization: Bearer sk_test_…</code> or <code>sk_live_…</code>. Rotate secrets from
          the merchant dashboard. Secret keys are hashed at rest and shown only once.
        </p>
        <h2 className="mt-10 text-2xl font-bold">Webhook events</h2>
        <Card className="mt-4 space-y-2 p-6 text-sm text-muted-foreground">
          <p><code>ticket.purchased</code></p>
          <p><code>ticket.refunded</code></p>
          <p><code>ticket.cancelled</code></p>
          <p><code>ticket.checked_in</code></p>
          <p><code>event.sold_out</code></p>
          <p><code>payment.failed</code></p>
          <p>Requests are HMAC-signed. Failed deliveries retry from the cron job.</p>
        </Card>
        <pre className="mt-8 overflow-x-auto rounded-xl bg-card p-4 text-xs">{`POST /api/v1/gateway/tickets/initialize
{
  "email": "guest@example.com",
  "ticket_tier_id": "uuid",
  "quantity": 2,
  "callback_url": "https://merchant.com/payment/callback",
  "metadata": { "buyer_name": "John Doe", "phone": "08012345678" }
}`}</pre>
        <h2 className="mt-10 text-2xl font-bold">Embeddable button</h2>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-card p-4 text-xs">{`<script
  src="https://your-bu-host/widget/bu-widget.js"
  data-public-key="pk_live_xxxx"
  data-event-id="lagos-summer-party-abc123">
</script>`}</pre>
      </main>
      <SiteFooter />
    </div>
  )
}
