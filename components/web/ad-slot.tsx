'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adMediaKind, getAdSlot } from '@/lib/admin/ad-slots'

export type AdCreative = {
  id: string
  title: string
  body?: string
  image_url?: string | null
  href?: string | null
}

export function AdSlot({ slot, className }: { slot: string; className?: string }) {
  const [ads, setAds] = useState<AdCreative[]>([])
  const spec = getAdSlot(slot)

  useEffect(() => {
    fetch(`/api/ads?slot=${encodeURIComponent(slot)}`)
      .then(async (res) => {
        const json = await res.json()
        if (json.status) setAds(json.data?.ads ?? [])
      })
      .catch(() => undefined)
  }, [slot])

  if (!ads.length) return null

  return (
    <div className={className ?? 'space-y-3'}>
      {ads.map((ad) => {
        const media = adMediaKind(ad.image_url)
        const hasMedia = Boolean(ad.image_url)
        const banner = spec?.fit === 'banner'
        const frameStyle = hasMedia && spec
          ? banner
            ? { height: spec.height, width: '100%' }
            : { aspectRatio: `${spec.width} / ${spec.height}` }
          : undefined
        const inner = (
          <div
            className={
              hasMedia
                ? `relative overflow-hidden border border-amber-400/20 bg-black ${banner ? 'rounded-lg' : 'rounded-2xl'}`
                : 'overflow-hidden rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-500/15 via-background to-primary/10 p-4'
            }
            style={frameStyle}
          >
            {media === 'video' && ad.image_url ? (
              <video
                src={ad.image_url}
                className="h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
              />
            ) : null}
            {media === 'image' && ad.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ad.image_url} alt="" className="h-full w-full object-cover" />
            ) : null}
            {ad.title || ad.body ? (
              <div
                className={
                  hasMedia
                    ? `absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent ${banner ? 'px-3 py-1.5' : 'p-4'}`
                    : ''
                }
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-300">Sponsored</p>
                {ad.title ? (
                  <p className={`font-semibold ${hasMedia ? 'mt-0.5 text-white' : 'mt-1 text-base'} ${banner ? 'text-sm' : 'text-base'}`}>
                    {ad.title}
                  </p>
                ) : null}
                {ad.body && !banner ? (
                  <p className={`mt-1 text-sm ${hasMedia ? 'text-white/80' : 'text-muted-foreground'}`}>{ad.body}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        )
        return ad.href ? (
          <Link key={ad.id} href={ad.href} className="block">
            {inner}
          </Link>
        ) : (
          <div key={ad.id}>{inner}</div>
        )
      })}
    </div>
  )
}
