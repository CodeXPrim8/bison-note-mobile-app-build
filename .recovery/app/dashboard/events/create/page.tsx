'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PublicShell } from '@/components/public-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface TierDraft {
  name: string
  price: string
  quantity_total: string
}

export default function CreateEventPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [venue, setVenue] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [celebrant, setCelebrant] = useState('')
  const [sprayBudget, setSprayBudget] = useState('0')
  const [subaccount, setSubaccount] = useState('')
  const [tiers, setTiers] = useState<TierDraft[]>([
    { name: 'General', price: '5000', quantity_total: '100' },
  ])

  const steps = ['Details', 'Tickets', 'Payments', 'Publish']

  async function publish(status: 'draft' | 'published') {
    setBusy(true)
    setError(null)
    const payload = {
      title,
      description,
      venue_name: venue || null,
      venue_lat: lat ? Number(lat) : null,
      venue_lng: lng ? Number(lng) : null,
      start_time: start ? new Date(start).toISOString() : new Date().toISOString(),
      end_time: end ? new Date(end).toISOString() : null,
      celebrant_name: celebrant || null,
      spray_budget_bu: Number(sprayBudget) || 0,
      paystack_subaccount_code: subaccount || null,
      status,
      ticket_tiers: tiers.map((tier) => ({
        name: tier.name,
        price: Number(tier.price) || 0,
        quantity_total: Number(tier.quantity_total) || 0,
      })),
    }
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = (await res.json()) as { status: boolean; message?: string; data?: { slug: string } }
    setBusy(false)
    if (!json.status) {
      setError(json.message ?? 'Could not create event')
      return
    }
    router.push('/dashboard/events')
  }

  return (
    <PublicShell title="Create event">
      <div className="px-4 py-6 space-y-4 pb-16">
        <div className="flex gap-2 text-xs">
          {steps.map((label, index) => (
            <button
              key={label}
              className={`flex-1 rounded-full py-1 ${index === step ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
              onClick={() => setStep(index)}
            >
              {label}
            </button>
          ))}
        </div>

        {step === 0 && (
          <Card className="p-4 space-y-3">
            <Input placeholder="Event title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Input placeholder="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Lat" value={lat} onChange={(e) => setLat(e.target.value)} />
              <Input placeholder="Lng" value={lng} onChange={(e) => setLng(e.target.value)} />
            </div>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            <Input placeholder="Celebrant / organizer name" value={celebrant} onChange={(e) => setCelebrant(e.target.value)} />
          </Card>
        )}

        {step === 1 && (
          <Card className="p-4 space-y-3">
            {tiers.map((tier, index) => (
              <div key={index} className="grid grid-cols-3 gap-2">
                <Input
                  placeholder="Name"
                  value={tier.name}
                  onChange={(e) => {
                    const next = [...tiers]
                    next[index] = { ...tier, name: e.target.value }
                    setTiers(next)
                  }}
                />
                <Input
                  placeholder="Price"
                  value={tier.price}
                  onChange={(e) => {
                    const next = [...tiers]
                    next[index] = { ...tier, price: e.target.value }
                    setTiers(next)
                  }}
                />
                <Input
                  placeholder="Qty"
                  value={tier.quantity_total}
                  onChange={(e) => {
                    const next = [...tiers]
                    next[index] = { ...tier, quantity_total: e.target.value }
                    setTiers(next)
                  }}
                />
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => setTiers([...tiers, { name: 'VIP', price: '15000', quantity_total: '20' }])}
            >
              Add tier
            </Button>
          </Card>
        )}

        {step === 2 && (
          <Card className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Optional Paystack subaccount code for organizer settlement. Leave blank to use demo checkout.
            </p>
            <Input placeholder="ACCT_xxx" value={subaccount} onChange={(e) => setSubaccount(e.target.value)} />
            <Input
              placeholder="Pre-load spray budget (BU)"
              value={sprayBudget}
              onChange={(e) => setSprayBudget(e.target.value)}
            />
          </Card>
        )}

        {step === 3 && (
          <Card className="p-4 space-y-3">
            <p className="font-semibold">{title || 'Untitled event'}</p>
            <p className="text-sm text-muted-foreground">{tiers.length} ticket tier(s)</p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" disabled={busy} onClick={() => publish('draft')}>
                Save draft
              </Button>
              <Button disabled={busy || !title} onClick={() => publish('published')}>
                {busy ? 'Publishing…' : 'Publish'}
              </Button>
            </div>
          </Card>
        )}

        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" className="flex-1" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step < 3 && (
            <Button className="flex-1" onClick={() => setStep(step + 1)}>
              Next
            </Button>
          )}
        </div>
      </div>
    </PublicShell>
  )
}
