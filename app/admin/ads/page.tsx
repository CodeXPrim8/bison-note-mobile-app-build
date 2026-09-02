'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { adminFetch } from '@/components/admin/api'
import { AdCreativeField } from '@/components/admin/ad-creative-field'
import { adMediaKind, getAdSlot, slotSizeLabel, type AdSlotSpec } from '@/lib/admin/ad-slots'

type Ad = {
  id: string
  slot: string
  title: string
  body: string
  image_url: string | null
  href: string | null
  active: boolean
}

export default function AdminAdsPage() {
  const [slots, setSlots] = useState<AdSlotSpec[]>([])
  const [ads, setAds] = useState<Ad[]>([])
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ slot: 'web_home', title: '', body: '', image_url: '', href: '' })
  const selected = getAdSlot(form.slot) ?? slots.find((slot) => slot.id === form.slot)

  async function load() {
    const data = await adminFetch<{ slots: AdSlotSpec[]; ads: Ad[] }>('/api/admin/ads')
    setSlots(data.slots)
    setAds(data.ads)
    if (data.slots[0] && !data.slots.some((slot) => slot.id === form.slot)) {
      setForm((prev) => ({ ...prev, slot: data.slots[0].id }))
    }
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function create() {
    try {
      setError(null)
      await adminFetch('/api/admin/ads', { method: 'POST', body: JSON.stringify(form) })
      setForm({ ...form, title: '', body: '', image_url: '', href: '' })
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function toggle(ad: Ad) {
    await adminFetch('/api/admin/ads', { method: 'PATCH', body: JSON.stringify({ id: ad.id, active: !ad.active }) })
    await load()
  }

  async function remove(id: string) {
    await adminFetch('/api/admin/ads', { method: 'DELETE', body: JSON.stringify({ id }) })
    await load()
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300">Inventory</p>
        <h1 className="mt-1 text-3xl font-bold">Adverts</h1>
        <p className="text-sm text-muted-foreground">
          Choose a slot, then upload an image or video in that exact size. Empty slots stay hidden.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Card className="space-y-3 p-6">
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={form.slot}
          onChange={(e) => setForm({ ...form, slot: e.target.value, image_url: '' })}
        >
          {(slots.length ? slots : [getAdSlot(form.slot)].filter(Boolean) as AdSlotSpec[]).map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.surface} · {slot.label} · {slotSizeLabel(slot)}
            </option>
          ))}
        </select>
        {selected ? (
          <p className="text-xs text-amber-200/80">
            {selected.label} is {slotSizeLabel(selected)}. Crop or export the creative to that size before upload.
          </p>
        ) : null}
        <Input placeholder="Headline" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Input placeholder="Line of copy" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <AdCreativeField
          slotId={form.slot}
          value={form.image_url}
          onChange={(image_url) => setForm((prev) => ({ ...prev, image_url }))}
        />
        <Input placeholder="Click URL (optional)" value={form.href} onChange={(e) => setForm({ ...form, href: e.target.value })} />
        <Button onClick={() => void create()}>Publish advert</Button>
      </Card>
      <div className="space-y-3">
        {ads.map((ad) => {
          const slot = getAdSlot(ad.slot)
          const media = adMediaKind(ad.image_url)
          return (
            <Card key={ad.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                {ad.image_url ? (
                  <div
                    className="overflow-hidden rounded-lg border border-amber-400/20 bg-black"
                    style={{
                      width: 160,
                      aspectRatio: slot ? `${slot.width} / ${slot.height}` : '16 / 5',
                    }}
                  >
                    {media === 'video' ? (
                      <video src={ad.image_url} className="h-full w-full object-cover" muted playsInline />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ad.image_url} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                ) : null}
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wider text-amber-300">
                    {ad.slot}
                    {slot ? ` · ${slotSizeLabel(slot)}` : ''}
                  </p>
                  <p className="font-semibold">{ad.title}</p>
                  <p className="text-sm text-muted-foreground">{ad.body}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void toggle(ad)}>
                  {ad.active ? 'Hide' : 'Show'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void remove(ad.id)}>
                  Delete
                </Button>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
