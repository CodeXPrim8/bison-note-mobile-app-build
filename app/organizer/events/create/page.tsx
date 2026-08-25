'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { EVENT_CATEGORIES, EVENT_CATEGORY_LABELS } from '@/lib/schemas/event'
import { clearDraft, loadDraft, saveDraft } from '@/lib/forms/draft'
import { CoverImageField } from '@/components/cover-image-field'

const CREATE_EVENT_DRAFT_KEY = 'bu-create-event-draft'

interface TierDraft {
  name: string
  price: string
  quantity_total: string
  description: string
  max_per_buyer: string
}

export default function CreateEventPage() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC')
  const [status, setStatus] = useState<'draft' | 'published'>('published')
  const [form, setForm] = useState({
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
  })
  const [tiers, setTiers] = useState<TierDraft[]>([
    { name: '', price: '', quantity_total: '', description: '', max_per_buyer: '6' },
  ])
  const [draftReady, setDraftReady] = useState(false)

  useEffect(() => {
    const draft = loadDraft<{
      visibility?: 'PUBLIC' | 'PRIVATE'
      status?: 'draft' | 'published'
      form?: typeof form
      tiers?: TierDraft[]
    }>(CREATE_EVENT_DRAFT_KEY)
    if (draft?.visibility) setVisibility(draft.visibility)
    if (draft?.status) setStatus(draft.status)
    if (draft?.form) setForm((current) => ({ ...current, ...draft.form }))
    if (draft?.tiers?.length) setTiers(draft.tiers)
    setDraftReady(true)
  }, [])

  useEffect(() => {
    if (!draftReady) return
    saveDraft(CREATE_EVENT_DRAFT_KEY, { visibility, status, form, tiers })
  }, [draftReady, visibility, status, form, tiers])

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(nextStatus: 'draft' | 'published' = status) {
    setBusy(true)
    setError(null)
    const payload = {
      ...form,
      cover_image_url: form.cover_image_url || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      venue_lat: form.venue_lat ? Number(form.venue_lat) : null,
      venue_lng: form.venue_lng ? Number(form.venue_lng) : null,
      capacity: form.capacity ? Number(form.capacity) : null,
      start_time: form.start_time ? new Date(form.start_time).toISOString() : new Date().toISOString(),
      end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
      ticket_sales_start: form.ticket_sales_start ? new Date(form.ticket_sales_start).toISOString() : null,
      ticket_sales_end: form.ticket_sales_end ? new Date(form.ticket_sales_end).toISOString() : null,
      visibility,
      status: nextStatus,
      ticket_tiers: tiers.map((tier) => ({
        name: tier.name,
        price: Number(tier.price) || 0,
        quantity_total: Number(tier.quantity_total) || 0,
        description: tier.description,
        max_per_buyer: Number(tier.max_per_buyer) || 10,
      })),
    }
    const res = await fetch('/api/events', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    setBusy(false)
    if (res.status === 401) {
      window.location.assign(`/login?next=${encodeURIComponent('/organizer/events/create')}`)
      return
    }
    if (!json.status) {
      setError(json.message ?? 'Could not create event')
      return
    }
    clearDraft(CREATE_EVENT_DRAFT_KEY)
    router.push(`/organizer/events/${json.data.event_id}`)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold">Create event</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        PUBLIC events appear on the website and in the app Upcoming Events. PRIVATE events only show under Invites.
      </p>
      <Card className="mt-6 p-6">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
          }}
        >
        <Input placeholder="Event name" value={form.title} onChange={(e) => set('title', e.target.value)} />
        <Textarea placeholder="Description" value={form.description} onChange={(e) => set('description', e.target.value)} />
        <CoverImageField value={form.cover_image_url} onChange={(url) => set('cover_image_url', url)} />
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Organiser name" value={form.organizer_name} onChange={(e) => set('organizer_name', e.target.value)} />
          <Input placeholder="Organiser info" value={form.organizer_info} onChange={(e) => set('organizer_info', e.target.value)} />
        </div>
        <select className="w-full rounded-md border border-border bg-secondary px-3 py-2" value={form.category} onChange={(e) => set('category', e.target.value)}>
          {EVENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {EVENT_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">Start <Input type="datetime-local" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} /></label>
          <label className="text-sm">End <Input type="datetime-local" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} /></label>
        </div>
        <Input placeholder="Venue name" value={form.venue_name} onChange={(e) => set('venue_name', e.target.value)} />
        <Input placeholder="Full location" value={form.venue_address} onChange={(e) => set('venue_address', e.target.value)} />
        <div className="grid gap-3 md:grid-cols-3">
          <Input placeholder="Lat" value={form.venue_lat} onChange={(e) => set('venue_lat', e.target.value)} />
          <Input placeholder="Lng" value={form.venue_lng} onChange={(e) => set('venue_lng', e.target.value)} />
          <Input placeholder="Capacity" value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Contact email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} />
          <Input placeholder="Contact phone" value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">Sales open <Input type="datetime-local" value={form.ticket_sales_start} onChange={(e) => set('ticket_sales_start', e.target.value)} /></label>
          <label className="text-sm">Sales close <Input type="datetime-local" value={form.ticket_sales_end} onChange={(e) => set('ticket_sales_end', e.target.value)} /></label>
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
          <p className="font-semibold">Ticket tiers</p>
          {tiers.map((tier, index) => (
            <div key={index} className="grid gap-2 md:grid-cols-5">
              <Input placeholder="Name" value={tier.name} onChange={(e) => {
                const next = [...tiers]; next[index] = { ...tier, name: e.target.value }; setTiers(next)
              }} />
              <Input placeholder="Price" value={tier.price} onChange={(e) => {
                const next = [...tiers]; next[index] = { ...tier, price: e.target.value }; setTiers(next)
              }} />
              <Input placeholder="Qty" value={tier.quantity_total} onChange={(e) => {
                const next = [...tiers]; next[index] = { ...tier, quantity_total: e.target.value }; setTiers(next)
              }} />
              <Input placeholder="Max / buyer" value={tier.max_per_buyer} onChange={(e) => {
                const next = [...tiers]; next[index] = { ...tier, max_per_buyer: e.target.value }; setTiers(next)
              }} />
              <Input placeholder="Perks" value={tier.description} onChange={(e) => {
                const next = [...tiers]; next[index] = { ...tier, description: e.target.value }; setTiers(next)
              }} />
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => setTiers([...tiers, { name: '', price: '', quantity_total: '', description: '', max_per_buyer: '4' }])}>
            Add tier
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" disabled={busy} onClick={() => { setStatus('published'); void submit('published') }}>
            Publish
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => { setStatus('draft'); void submit('draft') }}>
            Save draft
          </Button>
        </div>
        </form>
      </Card>
    </div>
  )
}
