'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Check, Copy, X } from 'lucide-react'
import { formatBu } from '@/lib/bu-rate'
import { REFERRAL_QUALIFY_BU, REFERRAL_REWARD_BU } from '@/lib/referrals-shared'

const STORAGE_KEY = 'bu_refer_popup_seen_at'
const INTERVAL_MS = 1000 * 60 * 60 * 24 * 4 // about every 4 days
const PREVIEW_CODE = 'BUAC0CACB8'

function isReferPreview() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const value = params.get('referPreview') ?? params.get('preview_refer')
  if (value == null) return params.has('referPreview') || params.has('preview_refer')
  return value === '' || value === '1' || value.toLowerCase() === 'true'
}

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
    const preview = isReferPreview()

    if (preview) {
      setCode(PREVIEW_CODE)
      setOpen(true)
      fetch('/api/referrals', { credentials: 'include', cache: 'no-store' })
        .then(async (res) => {
          const json = await res.json().catch(() => null)
          const nextCode = String(json?.data?.code || '')
          if (!cancelled && nextCode) setCode(nextCode)
        })
        .catch(() => undefined)
      return () => {
        cancelled = true
      }
    }

    const last = Number(window.localStorage.getItem(STORAGE_KEY) || 0)
    if (Number.isFinite(last) && Date.now() - last < INTERVAL_MS) return

    const timer = window.setTimeout(() => {
      fetch('/api/referrals', { credentials: 'include', cache: 'no-store' })
        .then(async (res) => {
          const json = await res.json().catch(() => null)
          if (cancelled || !json?.status) return
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
    <div className="fixed inset-0 z-[70] flex items-end justify-center px-4 pb-8 pt-16 sm:items-center sm:pb-0">
      <div
        className="absolute inset-0 bg-[color:var(--bu-navy-deep)]/60 backdrop-blur-[10px]"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div
        className="bu-rise relative w-full max-w-[380px] overflow-hidden rounded-[30px]"
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #f7f9ff 55%, #eef3ff 100%)',
          boxShadow:
            '0 28px 80px rgba(7,16,31,0.42), 0 0 0 1px rgba(47,123,255,0.18), inset 0 1px 0 rgba(255,255,255,0.95)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(34,224,255,0.7), rgba(47,123,255,0.85), rgba(139,92,246,0.7), transparent)',
          }}
        />

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full text-white"
          style={{
            background: 'rgba(11,23,51,0.45)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
            backdropFilter: 'blur(8px)',
          }}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Full artwork with frame padding — no crop, no color filters on the photo */}
        <div
          className="relative px-5 pb-2 pt-11"
          style={{
            background: 'linear-gradient(165deg, #2f7bff 0%, #3b82f6 45%, #2563eb 100%)',
          }}
        >
          <div className="relative mx-auto aspect-[4/3] w-full max-w-[220px] overflow-hidden rounded-[18px] bg-white shadow-[0_14px_32px_rgba(11,23,51,0.26)]">
            <Image
              src="/refer-campaign.png"
              alt="Refer friends on Bucks"
              fill
              className="object-contain object-center p-1.5"
              sizes="(max-width: 448px) 60vw, 220px"
              priority
            />
          </div>
          <p className="mt-3 pb-1 text-center text-[15px] font-semibold tracking-tight text-white">
            Share Bucks. Earn Ƀ{formatBu(REFERRAL_REWARD_BU)}.
          </p>
        </div>

        <div className="relative space-y-4 px-5 pb-5 pt-4">
          <div
            className="pointer-events-none absolute -right-8 top-0 h-28 w-28 rounded-full opacity-40 blur-2xl"
            style={{ background: 'radial-gradient(circle, rgba(34,224,255,0.35), transparent 70%)' }}
          />
          <div
            className="pointer-events-none absolute -left-10 bottom-8 h-24 w-24 rounded-full opacity-30 blur-2xl"
            style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.28), transparent 70%)' }}
          />

          <div className="relative">
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white"
              style={{
                background: 'linear-gradient(120deg, #2f7bff 0%, #8b5cf6 70%)',
                boxShadow: '0 8px 18px rgba(47,123,255,0.28)',
              }}
            >
              Invite and earn
            </span>
            <h2 className="mt-2.5 text-[22px] font-bold leading-tight tracking-tight text-[color:var(--bu-navy)]">
              Refer a friend. Get Ƀ{formatBu(REFERRAL_REWARD_BU)}.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--bu-navy-mid)]/80">
              Share your code. When a friend joins and funds or spends at least{' '}
              <span className="font-semibold text-[color:var(--bu-navy)]">
                Ƀ{formatBu(REFERRAL_QUALIFY_BU)}
              </span>
              , you earn{' '}
              <span className="font-semibold text-[color:var(--bu-navy)]">
                Ƀ{formatBu(REFERRAL_REWARD_BU)}
              </span>{' '}
              in your wallet.
            </p>
          </div>

          <div
            className="relative rounded-2xl px-3.5 py-3"
            style={{
              background: 'linear-gradient(165deg, rgba(255,255,255,0.95), rgba(239,244,255,0.9))',
              border: '1px solid rgba(47,123,255,0.22)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,1), 0 10px 28px rgba(47,123,255,0.08)',
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--bu-cyber)]">
              Your code
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-mono text-lg font-bold tracking-[0.08em] text-[color:var(--bu-navy)]">
                {code}
              </p>
              <button
                type="button"
                onClick={() => void copyCode()}
                className="bu-press inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white"
                style={{
                  background: 'linear-gradient(120deg, #0b1733 0%, #142a56 100%)',
                  boxShadow: '0 8px 18px rgba(11,23,51,0.22)',
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-[#22e0ff]" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="relative grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="bu-press h-11 rounded-2xl text-sm font-semibold text-[color:var(--bu-navy)]"
              style={{
                background: 'rgba(255,255,255,0.85)',
                border: '1px solid rgba(47,123,255,0.2)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,1)',
              }}
            >
              Later
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onOpenRefer()
              }}
              className="bu-press h-11 rounded-2xl text-sm font-semibold text-white"
              style={{
                background: 'linear-gradient(120deg, #2f7bff 0%, #8b5cf6 55%, #ff2d95 130%)',
                boxShadow: '0 14px 28px rgba(47,123,255,0.35)',
              }}
            >
              Open invites
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
