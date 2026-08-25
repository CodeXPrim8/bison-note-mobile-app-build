'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import type { TicketTier } from '@/lib/types/database'

interface Props {
  eventSlug: string
  eventId: string
  eventTitle: string
  tiers: TicketTier[]
}

export function TicketCheckoutForm({ eventSlug, eventId, eventTitle, tiers }: Props) {
  const router = useRouter()
  const active = tiers.filter((tier) => tier.is_active)
  const [tierId, setTierId] = useState(active[0]?.id ?? '')
  const [qty, setQty] = useState(1)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [spray, setSpray] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = useMemo(() => active.find((tier) => tier.id === tierId) ?? active[0], [active, tierId])
  const remaining = selected ? selected.quantity_total - selected.quantity_sold : 0
  const ticketTotal = Number(selected?.price ?? 0) * qty
  const total = ticketTotal + spray

  async function submit() {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/tickets/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          email,
          amount: total,
          ticket_tier_id: selected.id,
          quantity: qty,
          spray_bu_amount: spray,
          metadata: { buyer_name: name, phone },
        }),
      })
      const json = (await response.json()) as {
        status: boolean
        message: string
        data?: { authorization_url: string; reference: string }
      }
      if (!json.status || !json.data) {
        setError(json.message)
        return
      }
      router.push(json.data.authorization_url.startsWith('http') ? json.data.authorization_url : `/checkout/${json.data.reference}`)
    } catch {
      setError('Could not start checkout')
    } finally {
      setBusy(false)
    }
  }

  if (!selected) {
    return <p className="text-sm text-muted-foreground">No ticket tiers available.</p>
  }

  return (
    <Card className="border-primary/20 bg-card p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold mb-2">Choose a tier</p>
        <div className="space-y-2">
          {active.map((tier) => {
            const left = tier.quantity_total - tier.quantity_sold
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => setTierId(tier.id)}
                className={`w-full rounded-xl border p-3 text-left ${
                  tier.id === selected.id ? 'border-primary bg-primary/10' : 'border-border'
                }`}
              >
                <div className="flex justify-between">
                  <span className="font-semibold">{tier.name}</span>
                  <span className="text-primary font-bold">₦{Number(tier.price).toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{left} left</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm">Qty</span>
        <Input
          type="number"
          min={1}
          max={Math.max(1, remaining)}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
        />
      </div>

      <div>
        <p className="text-sm font-semibold mb-1">Add ɃU spray credit</p>
        <p className="text-xs text-muted-foreground mb-2">
          Load notes before the party. After payment they land in your wallet for spraying.
        </p>
        <div className="flex gap-2">
          {[0, 5000, 10000, 20000].map((amount) => (
            <Button
              key={amount}
              type="button"
              variant={spray === amount ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSpray(amount)}
            >
              {amount === 0 ? 'None' : `₦${amount / 1000}k`}
            </Button>
          ))}
        </div>
      </div>

      <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />

      <div className="flex justify-between font-bold">
        <span>Total</span>
        <span className="text-primary">₦{total.toLocaleString()}</span>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" disabled={busy || remaining < 1 || !email} onClick={submit}>
        {busy ? 'Starting checkout…' : remaining < 1 ? 'Sold out' : 'Get tickets'}
      </Button>
      <p className="text-[10px] text-muted-foreground text-center">
        {eventTitle} · event {eventId.slice(0, 8)} · /t/{eventSlug}
      </p>
    </Card>
  )
}
