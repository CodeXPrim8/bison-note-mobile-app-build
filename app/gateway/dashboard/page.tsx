'use client'

import { useEffect, useState } from 'react'
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

export default function GatewayDashboard() {
  const [business, setBusiness] = useState('')
  const [email, setEmail] = useState('')
  const [webhook, setWebhook] = useState('')
  const [keys, setKeys] = useState<{ public_key?: string; secret_key?: string; webhook_secret?: string } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [merchants, setMerchants] = useState<MerchantRow[]>([])
  const [events, setEvents] = useState<Array<{ id: string; title: string; slug: string; status: string }>>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [rotated, setRotated] = useState<string | null>(null)

  function load() {
    fetch('/api/gateway/mine')
      .then(async (res) => {
        const json = await res.json()
        if (json.status) {
          setMerchants(json.data.merchants ?? [])
          setEvents(json.data.events ?? [])
          setPayments(json.data.payments ?? [])
        }
      })
      .catch(() => undefined)
  }

  useEffect(load, [])

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

  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold">Gateway merchant</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Register to receive public_key and secret_key. The secret is shown once. Tickets still land in the ɃU app.
        </p>
        <Card className="mt-6 space-y-3 p-6">
          <Input placeholder="Business name" value={business} onChange={(e) => setBusiness(e.target.value)} />
          <Input placeholder="Business email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder="Webhook URL (optional)" value={webhook} onChange={(e) => setWebhook(e.target.value)} />
          <Button onClick={register}>Register merchant</Button>
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
                <p className="mt-2 font-mono text-xs">{merchant.public_key}</p>
                <p className="font-mono text-xs text-muted-foreground">{merchant.secret_key_prefix}…</p>
                <p className="mt-2 text-xs uppercase text-primary">{merchant.live_mode ? 'live' : 'test'} mode</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => rotate(merchant.id)}>
                Rotate secret
              </Button>
            </div>
            {merchant.webhook_url && (
              <p className="mt-3 text-xs text-muted-foreground">Webhook: {merchant.webhook_url}</p>
            )}
          </Card>
        ))}

        <h2 className="mt-10 text-xl font-bold">Gateway events</h2>
        <div className="mt-3 space-y-2">
          {events.map((event) => (
            <Card key={event.id} className="p-4">
              <p className="font-semibold">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                {event.status} · {event.slug}
              </p>
            </Card>
          ))}
          {events.length === 0 && <p className="text-sm text-muted-foreground">No Gateway events yet.</p>}
        </div>

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
        </div>
      </main>
    </div>
  )
}
