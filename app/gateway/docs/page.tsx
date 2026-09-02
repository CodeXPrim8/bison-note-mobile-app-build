import { SiteFooter, SiteHeader } from '@/components/web/site-chrome'
import { Card } from '@/components/ui/card'
import { getAppUrl } from '@/lib/env'

export default function GatewayDocs() {
  const app = getAppUrl()
  const initExample = `curl -X POST ${app}/api/v1/gateway/tickets/initialize \\
  -H "Authorization: Bearer sk_live_xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "guest@example.com",
    "event_id": "EVENT_UUID",
    "ticket_type": "vip",
    "quantity": 2,
    "callback_url": "https://yoursite.com/payment/callback",
    "metadata": { "buyer_name": "Ada", "phone": "08012345678" }
  }'`

  const verifyExample = `curl ${app}/api/v1/gateway/tickets/verify/BU_LIVE_REFERENCE \\
  -H "Authorization: Bearer sk_live_xxxx"`

  const widgetExample = `<script
  src="${app}/widget/bu-widget.js"
  data-public-key="pk_live_xxxx"
  data-event-id="EVENT_UUID"
  data-ticket-type="vip"
  data-button-text="Buy tickets">
</script>`

  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">ɃU Gateway</p>
        <h1 className="mt-2 text-4xl font-bold">API reference</h1>
        <p className="mt-3 text-muted-foreground">
          Same shape as Paystack: secret key on your server, public key in the browser, initialize, redirect, verify,
          webhook. Base URL <code className="text-foreground">{app}/api/v1/gateway</code>
        </p>

        <h2 className="mt-10 text-2xl font-bold">API keys</h2>
        <Card className="mt-4 space-y-3 p-6 text-sm">
          <p>
            <code>pk_live_…</code> / <code>pk_test_…</code> — public. Widget and hosted checkout only.
          </p>
          <p>
            <code>sk_live_…</code> / <code>sk_test_…</code> — secret. Your server only. Header{' '}
            <code>Authorization: Bearer sk_…</code>
          </p>
          <p className="text-muted-foreground">
            Production issues live keys. Localhost issues test keys. The secret is shown once; rotate it from the
            Gateway dashboard if you lose it.
          </p>
        </Card>

        <h2 className="mt-10 text-2xl font-bold">1. Initialize (secret key)</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your website&apos;s server starts the payment. ɃU returns <code>authorization_url</code>. Redirect the guest
          there. They pay on Paystack. ɃU mints the ticket.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-card p-4 text-xs">{initExample}</pre>
        <Card className="mt-4 space-y-2 p-6 text-sm text-muted-foreground">
          <p>
            <code>POST /tickets/initialize</code>
          </p>
          <p>Required: <code>email</code> and either <code>event_id</code> or <code>ticket_tier_id</code>.</p>
          <p>
            Optional: <code>ticket_type</code> (e.g. vip), <code>quantity</code>, <code>callback_url</code>,{' '}
            <code>metadata.buyer_name</code>, <code>metadata.phone</code>.
          </p>
          <p>
            Response: <code>authorization_url</code>, <code>access_code</code>, <code>reference</code>.
          </p>
          <p>
            Repeat the same body with header <code>Idempotency-Key</code> to safely retry.
          </p>
        </Card>

        <h2 className="mt-10 text-2xl font-bold">2. Verify</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          After the guest returns, or on your webhook, confirm with the secret key. Do not trust the browser.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-card p-4 text-xs">{verifyExample}</pre>
        <p className="mt-3 text-sm text-muted-foreground">
          <code>GET /tickets/verify/:reference</code> — <code>data.status</code> is <code>success</code> when tickets
          exist.
        </p>

        <h2 className="mt-10 text-2xl font-bold">3. Webhooks</h2>
        <Card className="mt-4 space-y-2 p-6 text-sm text-muted-foreground">
          <p>
            <code>POST /webhooks</code> with <code>{`{ "webhook_url": "https://yoursite.com/webhooks/bu" }`}</code>
          </p>
          <p>ɃU POSTs JSON <code>{`{ "event": "ticket.purchased", "data": { … } }`}</code></p>
          <p>
            Header <code>X-BU-Signature</code> is HMAC-SHA256 of the raw body using your <code>webhook_secret</code>.
          </p>
          <p>Events: ticket.purchased, ticket.checked_in, event.sold_out, payment.failed</p>
        </Card>

        <h2 className="mt-10 text-2xl font-bold">Events</h2>
        <Card className="mt-4 space-y-2 p-6 text-sm text-muted-foreground">
          <p>
            <code>GET /events</code> — your live organiser events and ticket type ids
          </p>
          <p>
            <code>GET /events/:event_id</code>
          </p>
          <p>
            <code>GET /events/:event_id/stats</code>
          </p>
          <p>
            <code>POST /events</code> — create a live ɃU event (same fields as Organiser create)
          </p>
        </Card>

        <h2 className="mt-10 text-2xl font-bold">Inline button (public key)</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Like Paystack Inline. Paste on your page. The secret key stays on your server; this only uses{' '}
          <code>pk_live_</code>.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-card p-4 text-xs">{widgetExample}</pre>

        <h2 className="mt-10 text-2xl font-bold">Who can sell</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Keys are tied to the ɃU organiser who registered them. They only sell that organiser&apos;s live events. Guests
          do not need a ɃU login. If their phone is already a ɃU ID, the ticket also appears in the ɃU app.
        </p>
      </main>
      <SiteFooter />
    </div>
  )
}
