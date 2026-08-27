'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SiteFooter, SiteHeader } from '@/components/web/site-chrome'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatNaira } from '@/lib/money'
import { clearDraft, loadDraft, saveDraft } from '@/lib/forms/draft'
import { isEventUpcoming } from '@/lib/events/sale'
import type { EventRecord, TicketTier } from '@/lib/types/database'

interface Quote {
  subtotal: number
  serviceFee: number
  total: number
  remaining?: number
}

export default function CheckoutPage({ params }: { params: Promise<{ event: string }> }) {
  const router = useRouter()
  const [slug, setSlug] = useState('')
  const [event, setEvent] = useState<(EventRecord & { ticket_tiers: TicketTier[] }) | null>(null)
  const [tierId, setTierId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fromApp, setFromApp] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const draftKey = slug ? `bu-checkout-draft:${slug}` : ''

  useEffect(() => {
    params.then(({ event: value }) => setSlug(value))
    setFromApp(new URLSearchParams(window.location.search).get('from') === 'app')
  }, [params])

  useEffect(() => {
    if (!draftKey) return
    const draft = loadDraft<{ name?: string; email?: string; phone?: string; quantity?: number; tierId?: string }>(draftKey)
    if (draft?.name) setName(draft.name)
    if (draft?.email) setEmail(draft.email)
    if (draft?.phone) setPhone(draft.phone)
    if (draft?.quantity) setQuantity(draft.quantity)
    if (draft?.tierId) setTierId(draft.tierId)
    setDraftReady(true)
  }, [draftKey])

  useEffect(() => {
    if (!draftKey || !draftReady) return
    saveDraft(draftKey, { name, email, phone, quantity, tierId })
  }, [draftKey, draftReady, name, email, phone, quantity, tierId])

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (json.status && json.data?.user) {
          if (json.data.user.email) setEmail((current) => current || json.data.user.email)
          if (json.data.profile?.display_name) setName((current) => current || json.data.profile.display_name)
          if (json.data.profile?.phone) setPhone((current) => current || json.data.profile.phone)
        }
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!slug) return
    fetch(`/api/events/slug/${slug}`, { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (json.status) {
          setEvent(json.data)
          if (!isEventUpcoming(json.data)) {
            setError('This event has ended')
            setTierId('')
            return
          }
          setTierId((current) => current || json.data.ticket_tiers?.[0]?.id || '')
        } else setError(json.message)
      })
      .catch(() => setError('Could not load event'))
  }, [slug])

  useEffect(() => {
    if (!tierId || (event && !isEventUpcoming(event))) return
    fetch('/api/tickets/quote', {
      method: 'POST',
      credentials: 'include',
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
    setBusy(true)
    setError(null)
    const res = await fetch('/api/tickets/initialize', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        ticket_tier_id: tierId,
        quantity,
        metadata: { buyer_name: name, phone, custom: fromApp ? { next: '/app' } : undefined },
      }),
    })
    const json = await res.json()
    setBusy(false)
    if (res.status === 401) {
      const checkoutPath = fromApp ? `/checkout/${slug}?from=app` : `/checkout/${slug}`
      window.location.assign(`/login?next=${encodeURIComponent(checkoutPath)}`)
      return
    }
    if (!json.status) {
      setError(json.message)
      return
    }
    if (draftKey) clearDraft(draftKey)
    window.location.assign(json.data.authorization_url)
  }

  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 py-12">
        <Button
          variant="ghost"
          type="button"
          onClick={() => (fromApp ? window.location.assign('/app') : router.back())}
        >
          ← Back
        </Button>
        <h1 className="mt-4 text-3xl font-bold">Checkout</h1>
        <p className="text-muted-foreground">{event?.title}</p>
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
              {(event?.ticket_tiers ?? []).map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name} — ₦{Number(tier.price).toLocaleString()}
                </option>
              ))}
            </select>
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 1)} />
            <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input placeholder="Phone / ɃU ID" value={phone} onChange={(e) => setPhone(e.target.value)} />
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
                {typeof quote.remaining === 'number' && (
                  <p className="text-xs text-muted-foreground">{quote.remaining} remaining</p>
                )}
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" disabled={busy || !email || !quote || (event ? !isEventUpcoming(event) : true)} type="submit">
              {busy ? 'Processing…' : event && !isEventUpcoming(event) ? 'Event ended' : 'Continue to payment'}
            </Button>
          </form>
        </Card>
      </main>
      <SiteFooter />
    </div>
  )
}
