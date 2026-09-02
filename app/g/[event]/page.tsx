'use client'

import { useEffect, useState } from 'react'
import { SiteFooter, SiteHeader } from '@/components/web/site-chrome'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatNaira } from '@/lib/money'
import { eventDateHasPassed } from '@/lib/events/sale'
import { formatEventDateTime } from '@/lib/datetime'

interface GatewayTier {
  id: string
  ticket_type: string
  name: string
  price: number
  quantity_available: number
}

interface GatewayEvent {
  id: string
  title: string
  date: string
  venue?: string | null
  ticket_types: GatewayTier[]
}

interface Quote {
  subtotal: number
  serviceFee: number
  total: number
  remaining?: number
}

export default function GatewayHostedCheckout({ params }: { params: Promise<{ event: string }> }) {
  const [eventId, setEventId] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [event, setEvent] = useState<GatewayEvent | null>(null)
  const [tierId, setTierId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    params.then(({ event: value }) => setEventId(value))
    const search = new URLSearchParams(window.location.search)
    setPublicKey(search.get('pk') || '')
    const type = search.get('type') || ''
    if (type) setTierId((current) => current || '')
  }, [params])

  useEffect(() => {
    if (!eventId || !publicKey) return
    fetch(`/api/v1/gateway/checkout/event?event=${encodeURIComponent(eventId)}`, {
      headers: { Authorization: `Bearer ${publicKey}` },
    })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) {
          setError(json.message ?? 'Could not load this event')
          return
        }
        const loaded = json.data as GatewayEvent
        setEvent(loaded)
        const preferred = new URLSearchParams(window.location.search).get('type')
        const match = loaded.ticket_types.find((tier) => tier.ticket_type === preferred || tier.id === preferred)
        setTierId((current) => current || match?.id || loaded.ticket_types[0]?.id || '')
      })
      .catch(() => setError('Could not load this event'))
  }, [eventId, publicKey])

  useEffect(() => {
    if (!tierId || (event && eventDateHasPassed({ start_time: event.date } as { start_time: string }))) return
    fetch('/api/tickets/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_tier_id: tierId, quantity }),
    })
      .then(async (res) => {
        const json = await res.json()
        if (json.status) {
          setQuote(json.data)
          setError(null)
        } else {
          setQuote(null)
          setError(json.message ?? 'Could not quote this ticket')
        }
      })
      .catch(() => undefined)
  }, [tierId, quantity, event])

  async function pay() {
    if (!publicKey) {
      setError('Missing public key (pk_live_…)')
      return
    }
    setBusy(true)
    setError(null)
    const res = await fetch('/api/v1/gateway/checkout/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${publicKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        event_id: event?.id || eventId,
        ticket_tier_id: tierId,
        quantity,
        metadata: { buyer_name: name, phone },
      }),
    })
    const json = await res.json()
    setBusy(false)
    if (!json.status) {
      setError(json.message)
      return
    }
    window.location.assign(json.data.authorization_url)
  }

  const ended = event ? eventDateHasPassed({ start_time: event.date }) : false

  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-3xl font-bold">Pay with ɃU</h1>
        <p className="text-muted-foreground">{event?.title ?? 'Ticket checkout'}</p>
        {event?.date && <p className="text-sm text-muted-foreground">{formatEventDateTime(event.date)}</p>}
        {event?.venue && <p className="text-sm text-muted-foreground">{event.venue}</p>}
        {!publicKey && (
          <p className="mt-4 text-sm text-destructive">This checkout needs a ɃU public key (pk_live_…).</p>
        )}
        <Card className="mt-6 p-6">
          <form
            className="space-y-4"
            onSubmit={(eventSubmit) => {
              eventSubmit.preventDefault()
              void pay()
            }}
          >
            <label className="text-sm font-semibold">Ticket type</label>
            <select
              className="w-full rounded-md border border-border bg-secondary px-3 py-2"
              value={tierId}
              onChange={(e) => setTierId(e.target.value)}
            >
              {(event?.ticket_types ?? []).map((tier) => (
                <option key={tier.id} value={tier.id} disabled={tier.quantity_available <= 0}>
                  {tier.name} — ₦{Number(tier.price).toLocaleString()}
                  {tier.quantity_available <= 0 ? ' (sold out)' : ''}
                </option>
              ))}
            </select>
            <label className="text-sm font-semibold">Quantity</label>
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 1)} />
            <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
            {quote && (
              <div className="space-y-1 border-t border-border pt-4 text-sm">
                <div className="flex justify-between">
                  <span>Tickets</span>
                  <span>{formatNaira(quote.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Service fee</span>
                  <span>{formatNaira(quote.serviceFee)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">{formatNaira(quote.total)}</span>
                </div>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" disabled={busy || !email || !quote || !publicKey || ended} type="submit">
              {busy ? 'Processing…' : ended ? 'Event ended' : 'Continue to payment'}
            </Button>
          </form>
        </Card>
      </main>
      <SiteFooter />
    </div>
  )
}
