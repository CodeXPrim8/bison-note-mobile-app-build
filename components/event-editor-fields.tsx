'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CoverImageField } from '@/components/cover-image-field'
import { EVENT_CATEGORIES, EVENT_CATEGORY_LABELS } from '@/lib/schemas/event'

export interface EventFormFields {
  title: string
  description: string
  organizer_name: string
  organizer_info: string
  category: string
  start_time: string
  end_time: string
  venue_name: string
  venue_address: string
  venue_lat: string
  venue_lng: string
  capacity: string
  contact_email: string
  contact_phone: string
  cover_image_url: string
  ticket_sales_start: string
  ticket_sales_end: string
}

export interface TierDraft {
  key?: string
  name: string
  price: string
  quantity_total: string
  description: string
  max_per_buyer: string
  quantity_sold?: number
}

export function emptyEventForm(): EventFormFields {
  return {
    title: '',
    description: '',
    organizer_name: '',
    organizer_info: '',
    category: 'other',
    start_time: '',
    end_time: '',
    venue_name: '',
    venue_address: '',
    venue_lat: '',
    venue_lng: '',
    capacity: '',
    contact_email: '',
    contact_phone: '',
    cover_image_url: '',
    ticket_sales_start: '',
    ticket_sales_end: '',
  }
}

export function emptyTier(): TierDraft {
  return { name: '', price: '', quantity_total: '', description: '', max_per_buyer: '6' }
}

export function namedTiers(tiers: TierDraft[]) {
  return tiers
    .map((tier) => ({
      key: tier.key?.trim() || undefined,
      name: tier.name.trim(),
      price: Number(tier.price) || 0,
      quantity_total: Number(tier.quantity_total) || 0,
      description: tier.description.trim() || undefined,
      max_per_buyer: Number(tier.max_per_buyer) || 6,
    }))
    .filter((tier) => tier.name)
}

export function EventEditorFields({
  form,
  set,
  visibility,
  setVisibility,
  tiers,
  patchTier,
  setTiers,
}: {
  form: EventFormFields
  set: <K extends keyof EventFormFields>(key: K, value: string) => void
  visibility: 'PUBLIC' | 'PRIVATE'
  setVisibility: (value: 'PUBLIC' | 'PRIVATE') => void
  tiers: TierDraft[]
  patchTier: (index: number, patch: Partial<TierDraft>) => void
  setTiers: (next: TierDraft[] | ((current: TierDraft[]) => TierDraft[])) => void
}) {
  return (
    <>
      <Input placeholder="Event name" value={form.title} onChange={(e) => set('title', e.target.value)} />
      <Textarea placeholder="Description" value={form.description} onChange={(e) => set('description', e.target.value)} />
      <CoverImageField value={form.cover_image_url} onChange={(url) => set('cover_image_url', url)} />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          Organiser name
          <Input placeholder="Who is hosting" value={form.organizer_name} onChange={(e) => set('organizer_name', e.target.value)} />
        </label>
        <label className="text-sm">
          Organiser info
          <Input placeholder="Short bio or company" value={form.organizer_info} onChange={(e) => set('organizer_info', e.target.value)} />
        </label>
      </div>
      <select className="w-full rounded-md border border-border bg-secondary px-3 py-2" value={form.category} onChange={(e) => set('category', e.target.value)}>
        {EVENT_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {EVENT_CATEGORY_LABELS[category]}
          </option>
        ))}
      </select>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          Start <Input type="datetime-local" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} />
        </label>
        <label className="text-sm">
          End <Input type="datetime-local" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} />
        </label>
      </div>
      <label className="text-sm">
        Venue name
        <Input placeholder="Ambiance" value={form.venue_name} onChange={(e) => set('venue_name', e.target.value)} />
      </label>
      <label className="text-sm">
        Full location
        <Input placeholder="Ikeja, Lagos" value={form.venue_address} onChange={(e) => set('venue_address', e.target.value)} />
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          Lat
          <Input placeholder="Optional" value={form.venue_lat} onChange={(e) => set('venue_lat', e.target.value)} />
        </label>
        <label className="text-sm">
          Lng
          <Input placeholder="Optional" value={form.venue_lng} onChange={(e) => set('venue_lng', e.target.value)} />
        </label>
        <label className="text-sm">
          Capacity
          <Input placeholder="Max guests" value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          Contact email
          <Input placeholder="Optional" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} />
        </label>
        <label className="text-sm">
          Contact phone
          <Input placeholder="Optional" value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          Sales open <Input type="datetime-local" value={form.ticket_sales_start} onChange={(e) => set('ticket_sales_start', e.target.value)} />
        </label>
        <label className="text-sm">
          Sales close <Input type="datetime-local" value={form.ticket_sales_end} onChange={(e) => set('ticket_sales_end', e.target.value)} />
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant={visibility === 'PUBLIC' ? 'default' : 'outline'} onClick={() => setVisibility('PUBLIC')}>
          Public event
        </Button>
        <Button type="button" variant={visibility === 'PRIVATE' ? 'default' : 'outline'} onClick={() => setVisibility('PRIVATE')}>
          Private / invite only
        </Button>
      </div>
      <div className="space-y-3">
        <p className="font-semibold">Ticket types</p>
        <p className="text-sm text-muted-foreground">
          Name each type and set its ₦ price and quantity. Buyers pick from these at checkout — for example Regular — ₦5,000 or VIP — ₦20,000.
        </p>
        {tiers.map((tier, index) => {
          const sold = Number(tier.quantity_sold) || 0
          return (
            <div key={tier.key || index} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Type {index + 1}</p>
                {tiers.length > 1 && sold <= 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setTiers((current) => current.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <label className="text-sm">
                Ticket type name
                <Input
                  placeholder="Regular, VIP, Table…"
                  value={tier.name}
                  onChange={(e) => patchTier(index, { name: e.target.value })}
                />
              </label>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="text-sm">
                  Price (₦)
                  <Input
                    placeholder="0 for free"
                    type="number"
                    min={0}
                    value={tier.price}
                    onChange={(e) => patchTier(index, { price: e.target.value })}
                  />
                </label>
                <label className="text-sm">
                  Quantity
                  <Input
                    placeholder="How many can be sold"
                    type="number"
                    min={sold}
                    value={tier.quantity_total}
                    onChange={(e) => patchTier(index, { quantity_total: e.target.value })}
                  />
                </label>
              </div>
              {sold > 0 && <p className="text-xs text-muted-foreground">{sold} already sold — quantity cannot go below that.</p>}
            </div>
          )
        })}
        <Button type="button" variant="outline" onClick={() => setTiers((current) => [...current, emptyTier()])}>
          Add ticket type
        </Button>
      </div>
    </>
  )
}
