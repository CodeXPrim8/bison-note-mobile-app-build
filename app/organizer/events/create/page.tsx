'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { clearDraft, loadDraft, saveDraft } from '@/lib/forms/draft'
import {
  EventEditorFields,
  emptyEventForm,
  emptyTier,
  namedTiers,
  type EventFormFields,
  type TierDraft,
} from '@/components/event-editor-fields'

const CREATE_EVENT_DRAFT_KEY = 'bu-create-event-draft'

export default function CreateEventPage() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC')
  const [status, setStatus] = useState<'draft' | 'published'>('published')
  const [form, setForm] = useState<EventFormFields>(emptyEventForm)
  const [tiers, setTiers] = useState<TierDraft[]>([emptyTier()])
  const [affiliateEnabled, setAffiliateEnabled] = useState(false)
  const [affiliateCommissionPct, setAffiliateCommissionPct] = useState('10')
  const [draftReady, setDraftReady] = useState(false)

  useEffect(() => {
    const draft = loadDraft<{
      visibility?: 'PUBLIC' | 'PRIVATE'
      status?: 'draft' | 'published'
      form?: EventFormFields
      tiers?: TierDraft[]
      affiliateEnabled?: boolean
      affiliateCommissionPct?: string
    }>(CREATE_EVENT_DRAFT_KEY)
    if (draft?.visibility) setVisibility(draft.visibility)
    if (draft?.status) setStatus(draft.status)
    if (draft?.form) setForm((current) => ({ ...current, ...draft.form }))
    if (draft?.tiers?.length) {
      setTiers(draft.tiers.map((tier) => ({ ...emptyTier(), ...tier })))
    }
    if (typeof draft?.affiliateEnabled === 'boolean') setAffiliateEnabled(draft.affiliateEnabled)
    if (draft?.affiliateCommissionPct) setAffiliateCommissionPct(draft.affiliateCommissionPct)
    setDraftReady(true)
  }, [])

  useEffect(() => {
    if (!draftReady) return
    saveDraft(CREATE_EVENT_DRAFT_KEY, { visibility, status, form, tiers, affiliateEnabled, affiliateCommissionPct })
  }, [draftReady, visibility, status, form, tiers, affiliateEnabled, affiliateCommissionPct])

  function set<K extends keyof EventFormFields>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function patchTier(index: number, patch: Partial<TierDraft>) {
    setTiers((current) => current.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)))
  }

  async function submit(nextStatus: 'draft' | 'published' = status) {
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
      status: nextStatus,
      ticket_tiers: ticketTiers,
      affiliate_enabled: affiliateEnabled,
      affiliate_commission_pct: Number(affiliateCommissionPct) || 0,
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
          <EventEditorFields
            form={form}
            set={set}
            visibility={visibility}
            setVisibility={setVisibility}
            tiers={tiers}
            patchTier={patchTier}
            setTiers={setTiers}
            affiliateEnabled={affiliateEnabled}
            setAffiliateEnabled={setAffiliateEnabled}
            affiliateCommissionPct={affiliateCommissionPct}
            setAffiliateCommissionPct={setAffiliateCommissionPct}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setStatus('published')
                void submit('published')
              }}
            >
              Publish
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setStatus('draft')
                void submit('draft')
              }}
            >
              Save draft
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
