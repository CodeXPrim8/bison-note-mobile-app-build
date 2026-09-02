'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SiteHeader } from '@/components/web/site-chrome'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { Payment } from '@/lib/types/database'

interface MerchantRow {
  id: string
  business_name: string
  email: string
  public_key: string
  secret_key_prefix: string
  webhook_url: string | null
  live_mode: boolean
}

interface GatewayEventRow {
  id: string
  title: string
  date: string
  ticket_types: Array<{ id: string; ticket_type: string; name: string; price: number }>
}

export default function GatewayDashboard() {
  const [business, setBusiness] = useState('')
  const [email, setEmail] = useState('')
  const [webhook, setWebhook] = useState('')
  const [keys, setKeys] = useState<{ public_key?: string; secret_key?: string; webhook_secret?: string } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [merchants, setMerchants] = useState<MerchantRow[]>([])
  const [events, setEvents] = useState<GatewayEventRow[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [rotated, setRotated] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')

  function load() {
    fetch('/api/gateway/mine')
      .then(async (res) => {
        const json = await res.json()
        if (json.status) {
          setMerchants(json.data.merchants ?? [])
          setEvents(json.data.events ?? [])
          setPayments(json.data.payments ?? [])
          if (json.data.setup_hint) setMessage(json.data.setup_hint)
        } else {
          setMerchants([])
          setEvents([])
          setPayments([])
          setMessage(json.message)
        }
      })
      .catch(() => undefined)
  }

  useEffect(() => {
    setOrigin(window.location.origin)
    load()
  }, [])

  async function register() {
    const res = await fetch('/api/v1/gateway/merchants/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_name: business, email, webhook_url: webhook || undefined }),
    })
    const json = await res.json()
    if (!json.status) {
      setMessage(json.message)
      return
    }
    setKeys(json.data)
    setMessage(json.data.note)
    load()
  }

  async function rotate(id: string) {
    const res = await fetch('/api/gateway/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant_id: id }),
    })
    const json = await res.json()
    if (json.status) {
      setRotated(json.data.secret_key)
      setMessage(json.data.note)
      load()
    } else setMessage(json.message)
  }

  const sampleEvent = events[0]

  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold">Gateway keys</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Like Paystack: put <code>sk_live_</code> on another website&apos;s server. Guests pay, ɃU issues the ticket.{' '}
          <Link href="/gateway/docs" className="text-primary underline">
            API docs
          </Link>
        </p>
        <Card className="mt-6 space-y-3 p-6">
          <Input placeholder="Business name" value={business} onChange={(e) => setBusiness(e.target.value)} />
          <Input placeholder="Business email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder="Webhook URL (optional)" value={webhook} onChange={(e) => setWebhook(e.target.value)} />
          <Button onClick={() => void register()}>Create live keys</Button>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
          {keys && (
            <pre className="overflow-x-auto rounded-md bg-secondary p-3 text-xs">{JSON.stringify(keys, null, 2)}</pre>
          )}
          {rotated && (
            <pre className="overflow-x-auto rounded-md bg-secondary p-3 text-xs">New secret_key: {rotated}</pre>
          )}
        </Card>

        {merchants.map((merchant) => (
          <Card key={merchant.id} className="mt-6 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{merchant.business_name}</h2>
                <p className="text-sm text-muted-foreground">{merchant.email}</p>
                <p className="mt-2 font-mono text-xs break-all">{merchant.public_key}</p>
                <p className="font-mono text-xs text-muted-foreground">{merchant.secret_key_prefix}…</p>
                <p className="mt-2 text-xs uppercase text-primary">{merchant.live_mode ? 'live' : 'test'} mode</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void rotate(merchant.id)}>
                Rotate secret
              </Button>
            </div>
            {merchant.webhook_url && (
              <p className="mt-3 text-xs text-muted-foreground">Webhook: {merchant.webhook_url}</p>
            )}
          </Card>
        ))}

        <h2 className="mt-10 text-xl font-bold">Your live events</h2>
        <p className="mt-1 text-sm text-muted-foreground">These keys can sell only these events.</p>
        <div className="mt-3 space-y-2">
          {events.map((event) => (
            <Card key={event.id} className="p-4">
              <p className="font-semibold">{event.title}</p>
              <p className="font-mono text-xs text-muted-foreground break-all">{event.id}</p>
              <ul className="mt-2 space-y-1 text-xs">
                {(event.ticket_types ?? []).map((tier) => (
                  <li key={tier.id} className="font-mono">
                    {tier.name} · {tier.ticket_type} · ₦{Number(tier.price).toLocaleString()} · {tier.id}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {events.length === 0 && (
            <p className="text-sm text-muted-foreground">Create an event in Organiser first, then it appears here.</p>
          )}
        </div>

        {sampleEvent && merchants[0] && (
          <Card className="mt-8 p-4">
            <p className="text-sm font-semibold">Server initialize example</p>
            <pre className="mt-2 overflow-x-auto text-xs">{`POST ${origin}/api/v1/gateway/tickets/initialize
Authorization: Bearer ${merchants[0].secret_key_prefix}…
{
  "email": "guest@example.com",
  "event_id": "${sampleEvent.id}",
  "ticket_type": "${sampleEvent.ticket_types?.[0]?.ticket_type ?? 'general'}",
  "quantity": 1
}`}</pre>
          </Card>
        )}

        <h2 className="mt-10 text-xl font-bold">Transactions</h2>
        <div className="mt-3 space-y-2">
          {payments.slice(0, 20).map((payment) => (
            <Card key={payment.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-mono text-xs">{payment.reference}</p>
                <p className="text-xs text-muted-foreground">{payment.buyer_email}</p>
              </div>
              <span className="text-xs uppercase text-primary">{payment.status}</span>
            </Card>
          ))}
          {payments.length === 0 && (
            <p className="text-sm text-muted-foreground">Live ticket sales show after a guest pays through these keys.</p>
          )}
        </div>
      </main>
    </div>
  )
}
