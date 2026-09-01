'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toDatetimeLocalValue } from '@/lib/datetime'
import { parseLiveTierKey } from '@/lib/events/ticket-types'
import type { EventRecord, TicketTier } from '@/lib/types/database'
import {
  EventEditorFields,
  emptyEventForm,
  emptyTier,
  namedTiers,
  type EventFormFields,
  type TierDraft,
} from '@/components/event-editor-fields'

export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC')
  const [form, setForm] = useState<EventFormFields>(emptyEventForm)
  const [tiers, setTiers] = useState<TierDraft[]>([emptyTier()])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/events/${id}`, { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (cancelled) return
        if (res.status === 401) {
          window.location.assign(`/login?next=${encodeURIComponent(`/organizer/events/${id}/edit`)}`)
          return
        }
        if (!json.status) {
          setError(json.message ?? 'Could not load this event')
          setLoading(false)
          return
        }
        const event = json.data.event as EventRecord
        const ticketTiers = (json.data.ticket_tiers ?? []) as TicketTier[]
        setVisibility(event.visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC')
        setForm({
          title: event.title ?? '',
          description: event.description ?? '',
          organizer_name: event.organizer_name ?? '',
          organizer_info: event.organizer_info ?? '',
          category: event.category ?? 'other',
          start_time: toDatetimeLocalValue(event.start_time),
          end_time: toDatetimeLocalValue(event.end_time),
          venue_name: event.venue_name ?? '',
          venue_address: event.venue_address ?? '',
          venue_lat: event.venue_lat == null ? '' : String(event.venue_lat),
          venue_lng: event.venue_lng == null ? '' : String(event.venue_lng),
          capacity: event.capacity == null ? '' : String(event.capacity),
          contact_email: event.contact_email ?? '',
          contact_phone: event.contact_phone ?? '',
          cover_image_url: event.cover_image_url ?? '',
          ticket_sales_start: toDatetimeLocalValue(event.ticket_sales_start),
          ticket_sales_end: toDatetimeLocalValue(event.ticket_sales_end),
        })
        setTiers(
          ticketTiers.length
            ? ticketTiers.map((tier) => ({
                key: String(tier.metadata?.key ?? '').trim() || parseLiveTierKey(tier.id),
                name: tier.name,
                price: String(tier.price ?? ''),
                quantity_total: String(tier.quantity_total ?? ''),
                description: tier.description ?? '',
                max_per_buyer: String(tier.max_per_buyer ?? 6),
                quantity_sold: Number(tier.quantity_sold) || 0,
              }))
            : [emptyTier()],
        )
        setError(null)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load this event')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  function set<K extends keyof EventFormFields>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function patchTier(index: number, patch: Partial<TierDraft>) {
    setTiers((current) => current.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)))
  }

  async function save() {
    setBusy(true)
    setError(null)
    const ticketTiers = namedTiers(tiers)
    if (!ticketTiers.length) {
      setBusy(false)
      setError('Name at least one ticket type and set its price.')
      return
    }
    const payload = {
      ...form,
      cover_image_url: form.cover_image_url || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      venue_lat: form.venue_lat ? Number(form.venue_lat) : null,
      venue_lng: form.venue_lng ? Number(form.venue_lng) : null,
      capacity: form.capacity
        ? Number(form.capacity)
        : ticketTiers.reduce((sum, tier) => sum + (tier.quantity_total || 0), 0),
      start_time: form.start_time ? new Date(form.start_time).toISOString() : new Date().toISOString(),
      end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
      ticket_sales_start: form.ticket_sales_start ? new Date(form.ticket_sales_start).toISOString() : null,
      ticket_sales_end: form.ticket_sales_end ? new Date(form.ticket_sales_end).toISOString() : null,
      visibility,
      status: 'published',
      ticket_tiers: ticketTiers,
    }
    const res = await fetch(`/api/events/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    setBusy(false)
    if (res.status === 401) {
      window.location.assign(`/login?next=${encodeURIComponent(`/organizer/events/${id}/edit`)}`)
      return
    }
    if (!json.status) {
      setError(json.message ?? 'Could not save this event')
      return
    }
    router.push(`/organizer/events/${id}`)
  }

  if (loading) return <p className="text-muted-foreground">Loading event…</p>

  if (error && !form.title) {
    return (
      <div className="space-y-3">
        <p className="text-destructive">{error}</p>
        <Button asChild variant="outline">
          <Link href={`/organizer/events/${id}`}>Back</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" className="-ml-3">
        <Link href={`/organizer/events/${id}`}>← Back</Link>
      </Button>
      <h1 className="mt-2 text-3xl font-bold">Edit event</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Changes go live on the public page and at checkout. You cannot remove a ticket type after tickets have been sold.
      </p>
      <Card className="mt-6 p-6">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <EventEditorFields
            form={form}
            set={set}
            visibility={visibility}
            setVisibility={setVisibility}
            tiers={tiers}
            patchTier={patchTier}
            setTiers={setTiers}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
            <Button asChild type="button" variant="outline">
              <Link href={`/organizer/events/${id}`}>Cancel</Link>
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
