'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  PartyPopper,
  QrCode,
  Send,
  Smartphone,
  Sparkles,
  Ticket,
  Wifi,
} from 'lucide-react'
import { adMediaKind, getAdSlot } from '@/lib/admin/ad-slots'

type CampaignSlide = {
  id: string
  title: string
  body: string
  tags: Array<{ label: string; Icon: LucideIcon }>
  Icon: LucideIcon
  imageUrl?: string | null
  href?: string | null
  kind?: 'image' | 'video' | null
}

type AdCreative = {
  id: string
  title: string
  body?: string
  image_url?: string | null
  href?: string | null
}

const FALLBACK_SLIDES: CampaignSlide[] = [
  {
    id: 'celebrate',
    title: 'Celebrate Better',
    body: 'Send ɃU to events — receive ceremonial notes for spraying',
    tags: [
      { label: 'Digital', Icon: Wifi },
      { label: 'Mobile', Icon: Smartphone },
    ],
    Icon: Sparkles,
  },
  {
    id: 'send',
    title: 'Send ɃU Instantly',
    body: 'Transfer to any Ƀucks account number or scan a receive QR',
    tags: [
      { label: 'Transfer', Icon: Send },
      { label: 'QR', Icon: QrCode },
    ],
    Icon: Send,
  },
  {
    id: 'spray',
    title: 'Spray the Moment',
    body: 'Fund your spray wallet and shower the celebrant at live events',
    tags: [
      { label: 'Events', Icon: PartyPopper },
      { label: 'Spray', Icon: Sparkles },
    ],
    Icon: PartyPopper,
  },
  {
    id: 'tip',
    title: 'Tip Without Cash',
    body: 'Scan and tip performers, hosts, and helpers in seconds',
    tags: [
      { label: 'Tip', Icon: Sparkles },
      { label: 'Scan', Icon: QrCode },
    ],
    Icon: QrCode,
  },
  {
    id: 'fund',
    title: 'Fund From Any Bank',
    body: 'Transfer Naira to your Ƀucks account — 1 ɃU = ₦1 lands automatically',
    tags: [
      { label: 'Bank', Icon: Banknote },
      { label: 'Top-up', Icon: Wifi },
    ],
    Icon: Banknote,
  },
  {
    id: 'tickets',
    title: 'Tickets in ɃU',
    body: 'Buy event tickets with your wallet and keep passes on your phone',
    tags: [
      { label: 'Tickets', Icon: Ticket },
      { label: 'Wallet', Icon: Smartphone },
    ],
    Icon: Ticket,
  },
]

const ROTATE_MS = 8500
const SLOT_ID = 'app_campaign'
const slotSpec = getAdSlot(SLOT_ID)

export function SmartCampaign() {
  const [ads, setAds] = useState<AdCreative[]>([])
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    fetch(`/api/ads?slot=${encodeURIComponent(SLOT_ID)}`)
      .then(async (res) => {
        const json = await res.json()
        if (json.status) setAds((json.data?.ads ?? []) as AdCreative[])
      })
      .catch(() => undefined)
  }, [])

  const slides = useMemo<CampaignSlide[]>(() => {
    const withMedia = ads.filter((ad) => ad.image_url)
    if (withMedia.length) {
      return withMedia.map((ad) => ({
        id: ad.id,
        title: ad.title || 'Campaign',
        body: ad.body || '',
        tags: [],
        Icon: Sparkles,
        imageUrl: ad.image_url,
        href: ad.href,
        kind: adMediaKind(ad.image_url),
      }))
    }
    return FALLBACK_SLIDES
  }, [ads])

  useEffect(() => {
    setIndex(0)
  }, [slides.length])

  useEffect(() => {
    if (slides.length < 2) return
    const timer = window.setInterval(() => {
      setVisible(false)
      window.setTimeout(() => {
        setIndex((current) => (current + 1) % slides.length)
        setVisible(true)
      }, 220)
    }, ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [slides.length])

  const slide = slides[index] ?? slides[0]
  if (!slide) return null

  const hasMedia = Boolean(slide.imageUrl)
  const SlideIcon = slide.Icon
  const frameStyle = slotSpec
    ? { aspectRatio: `${slotSpec.width} / ${slotSpec.height}` }
    : { height: '12rem' }

  const card = (
    <div className="bu-campaign relative overflow-hidden rounded-[24px] text-white" style={frameStyle}>
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {hasMedia && slide.kind === 'video' ? (
          <video
            key={slide.id}
            src={slide.imageUrl ?? undefined}
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
          />
        ) : null}
        {hasMedia && slide.kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={slide.id}
            src={slide.imageUrl ?? undefined}
            alt={slide.title}
            className="h-full w-full object-cover"
          />
        ) : null}
        {!hasMedia ? (
          <div className="absolute inset-0 flex flex-col justify-between p-5 pb-8">
            <div className="bu-glass-dark absolute right-5 top-5 flex h-12 w-12 items-center justify-center rounded-2xl">
              <SlideIcon className="h-6 w-6 text-white/90" strokeWidth={1.8} />
            </div>
            <div className="space-y-2 pr-16">
              <h4 className="text-xl font-bold leading-tight">{slide.title}</h4>
              <p className="text-sm leading-snug text-white/75">{slide.body}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {slide.tags.map((tag) => (
                  <span
                    key={`${slide.id}-${tag.label}`}
                    className="bu-glass-dark inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                  >
                    <tag.Icon className="h-3.5 w-3.5" />
                    {tag.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : slide.title || slide.body ? (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-5 pb-8 pt-10">
            {slide.title ? <p className="text-base font-semibold text-white">{slide.title}</p> : null}
            {slide.body ? <p className="mt-0.5 text-sm text-white/80">{slide.body}</p> : null}
          </div>
        ) : null}
      </div>

      {slides.length > 1 ? (
        <div className="absolute bottom-3 right-5 z-[1] flex gap-1.5">
          {slides.map((item, i) => (
            <span
              key={item.id}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/35'
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  )

  return (
    <div className="px-4">
      <h3 className="mb-4 text-lg font-bold">Campaign Updates</h3>
      {slide.href ? (
        <Link href={slide.href} className="block">
          {card}
        </Link>
      ) : (
        card
      )}
    </div>
  )
}
