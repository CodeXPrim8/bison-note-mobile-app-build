'use client'

import { useEffect, useState } from 'react'
import { giftLine, type PurposeGift, type PurposeId } from '@/lib/purpose'
import { PurposeIcon } from '@/components/icons/purpose-icons'

type Place = {
  user_id: string
  business_name: string
  category: PurposeId | null
  latitude: number
  longitude: number
}

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180
  const dLat = (bLat - aLat) * rad
  const dLng = (bLng - aLng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function GiftPopup({
  onSpend,
}: {
  onSpend: (gift: PurposeGift) => void
}) {
  const [gift, setGift] = useState<PurposeGift | null>(null)
  const [line, setLine] = useState('')

  useEffect(() => {
    let cancel = false
    async function load() {
      const res = await fetch('/api/purpose-gifts', { credentials: 'include', cache: 'no-store' })
      const json = await res.json().catch(() => null)
      const gifts = (json?.data?.gifts ?? []) as PurposeGift[]
      if (cancel || !gifts.length) return
      const seenRaw = window.localStorage.getItem('bu_gift_seen') ?? '[]'
      let seenIds: string[] = []
      try {
        const parsed = JSON.parse(seenRaw) as unknown
        seenIds = Array.isArray(parsed) ? parsed.map(String) : []
      } catch {
        seenIds = []
      }
      const seen = new Set<string>(seenIds)
      const fresh = gifts.find((row) => !seen.has(row.id))
      if (fresh) {
        setGift(fresh)
        setLine(giftLine(fresh))
        return
      }
      if (window.sessionStorage.getItem('bu_gift_place_popup') === '1') return
      if (!navigator.geolocation) return
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const placesRes = await fetch('/api/vendor/profile?places=1', { credentials: 'include' })
        const placesJson = await placesRes.json().catch(() => null)
        const places = (placesJson?.data?.places ?? []) as Place[]
        let best: { gift: PurposeGift; meters: number } | null = null
        for (const place of places) {
          if (!place.category) continue
          const meters = distanceMeters(pos.coords.latitude, pos.coords.longitude, place.latitude, place.longitude)
          if (meters > 400) continue
          const match = gifts.find((row) => row.purpose === place.category)
          if (!match) continue
          if (!best || meters < best.meters) best = { gift: match, meters }
        }
        if (cancel || !best) return
        window.sessionStorage.setItem('bu_gift_place_popup', '1')
        setGift(best.gift)
        setLine(giftLine(best.gift))
      })
    }
    void load()
    return () => {
      cancel = true
    }
  }, [])

  if (!gift) return null

  function later() {
    const seenRaw = window.localStorage.getItem('bu_gift_seen') ?? '[]'
    let seenIds: string[] = []
    try {
      const parsed = JSON.parse(seenRaw) as unknown
      seenIds = Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      seenIds = []
    }
    const seen = new Set<string>(seenIds)
    seen.add(gift!.id)
    window.localStorage.setItem('bu_gift_seen', JSON.stringify([...seen]))
    setGift(null)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-4 sm:items-center">
      <div className="w-full max-w-sm overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_rgba(11,23,51,0.28)]">
        <div className="bg-[linear-gradient(135deg,#2f7bff,#8b5cf6_55%,#ff2d95)] px-6 pb-8 pt-7 text-white">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
            <PurposeIcon purpose={gift.purpose} className="h-7 w-7" />
          </span>
          <p className="mt-4 text-lg font-semibold leading-snug">{line}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4">
          <button
            type="button"
            className="h-12 rounded-2xl bg-neutral-950 text-sm font-semibold text-white"
            onClick={() => {
              later()
              onSpend(gift)
            }}
          >
            Spend now
          </button>
          <button
            type="button"
            className="h-12 rounded-2xl bg-neutral-100 text-sm font-semibold text-neutral-900"
            onClick={later}
          >
            Spend later
          </button>
        </div>
      </div>
    </div>
  )
}
