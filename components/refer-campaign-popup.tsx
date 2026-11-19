'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Check, Copy, X } from 'lucide-react'
import { formatBu } from '@/lib/bu-rate'
import { REFERRAL_REWARD_BU } from '@/lib/referrals-shared'

const STORAGE_KEY = 'bu_refer_popup_seen_at'
const INTERVAL_MS = 1000 * 60 * 60 * 24 * 4 // about every 4 days

export default function ReferCampaignPopup({
  onOpenRefer,
}: {
  onOpenRefer: () => void
}) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    const last = Number(window.localStorage.getItem(STORAGE_KEY) || 0)
    if (Number.isFinite(last) && Date.now() - last < INTERVAL_MS) return

    const timer = window.setTimeout(() => {
      fetch('/api/referrals', { credentials: 'include', cache: 'no-store' })
        .then(async (res) => {
          const json = await res.json()
          if (cancelled || !json.status) return
          const nextCode = String(json.data?.code || '')
          if (!nextCode) return
          setCode(nextCode)
          setOpen(true)
          window.localStorage.setItem(STORAGE_KEY, String(Date.now()))
        })
        .catch(() => undefined)
    }, 1800)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  async function copyCode() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#07101f]/55 px-4 pb-8 pt-16 backdrop-blur-sm sm:items-center sm:pb-0">
      <div className="bu-rise relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_24px_80px_rgba(7,16,31,0.35)]">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative h-44 w-full bg-gradient-to-br from-[#2f7bff] via-[#5b8dff] to-[#8b5cf6]">
          <Image
            src="/refer-campaign.png"
            alt="Refer friends on Bucks"
            fill
            className="object-cover object-[center_20%]"
            sizes="(max-width: 448px) 100vw, 448px"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <p className="absolute bottom-3 left-4 right-4 text-sm font-semibold text-white">
            Share Bucks. Earn Ƀ{formatBu(REFERRAL_REWARD_BU)}.
          </p>
        </div>

        <div className="space-y-4 px-5 pb-5 pt-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Invite campaign</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-neutral-950">
              Refer a friend. Get Ƀ{formatBu(REFERRAL_REWARD_BU)}.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Your people deserve a smarter wallet. Share your code — when they join Bucks with it, you earn{' '}
              <span className="font-semibold text-neutral-950">Ƀ{formatBu(REFERRAL_REWARD_BU)}</span> in your wallet.
              Real invites. Real rewards.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Your code</p>
            <div className="mt-1.5 flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-mono text-lg font-bold tracking-wide text-neutral-950">
                {code}
              </p>
              <button
                type="button"
                onClick={() => void copyCode()}
                className="bu-press inline-flex items-center gap-1.5 rounded-full bg-neutral-950 px-3 py-2 text-xs font-semibold text-white"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="bu-press h-11 rounded-2xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-700"
            >
              Later
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onOpenRefer()
              }}
              className="bu-press h-11 rounded-2xl bg-neutral-950 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(11,23,51,0.22)]"
            >
              Open invites
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
