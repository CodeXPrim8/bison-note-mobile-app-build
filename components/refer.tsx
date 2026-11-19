'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { Check, Copy, Link2, Users } from 'lucide-react'
import { formatBu } from '@/lib/bu-rate'
import { formatEventDateTime } from '@/lib/datetime'
import { REFERRAL_QUALIFY_BU, REFERRAL_REWARD_BU } from '@/lib/referrals-shared'

type ReferralStats = {
  code: string
  link_path: string
  reward_bu: number
  earned_bu: number
  referral_count: number
  already_referred: boolean
  referrals: Array<{ id: string; reward_bu: number; status: string; created_at: string }>
}

export default function Refer() {
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)

  const shareLink = useMemo(() => {
    if (!stats?.code) return ''
    if (typeof window === 'undefined') return stats.link_path
    return `${window.location.origin}/r/${stats.code}`
  }, [stats?.code, stats?.link_path])

  useEffect(() => {
    fetch('/api/referrals', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) {
          setMessage(json.message || 'Could not load referrals')
          return
        }
        setStats(json.data as ReferralStats)
      })
      .catch(() => setMessage('Could not load referrals'))
  }, [])

  async function copy(kind: 'code' | 'link') {
    const value = kind === 'code' ? stats?.code : shareLink
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setCopied(null)
    }
  }

  const brandGradient = 'linear-gradient(135deg, #2f7bff 0%, #8b5cf6 52%, #ff2d95 100%)'
  const copyBtnStyle = {
    background: brandGradient,
    boxShadow: '0 10px 22px rgba(47,123,255,0.28)',
  } as const

  return (
    <div className="space-y-4 bg-transparent px-4 pb-28 pt-4 text-neutral-950">
      <div
        className="relative overflow-hidden rounded-[30px] p-5 text-white"
        style={{
          background: brandGradient,
          boxShadow:
            '0 20px 44px rgba(47,123,255,0.32), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.08)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(255,255,255,0.75), transparent)',
          }}
        />
        <div
          className="pointer-events-none absolute -right-10 -top-8 h-36 w-36 rounded-full opacity-40 blur-2xl"
          style={{ background: 'radial-gradient(circle, rgba(34,224,255,0.55), transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-10 -left-8 h-32 w-32 rounded-full opacity-35 blur-2xl"
          style={{ background: 'radial-gradient(circle, rgba(255,45,149,0.45), transparent 70%)' }}
        />
        <div className="relative mx-auto mb-3 aspect-[4/3] w-full max-w-[180px] overflow-hidden rounded-[18px] bg-white p-1.5 shadow-[0_12px_28px_rgba(11,23,51,0.2)]">
          <div className="relative h-full w-full">
            <Image
              src="/refer-campaign.png"
              alt=""
              fill
              className="object-contain object-center"
              sizes="180px"
              priority
            />
          </div>
        </div>
        <div className="relative text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">Invite & earn</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Refer friends</h1>
          <p className="mt-1 text-sm text-white/80">
            Earn Ƀ{formatBu(REFERRAL_REWARD_BU)} after a friend joins and funds or spends Ƀ
            {formatBu(REFERRAL_QUALIFY_BU)}.
          </p>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-2">
          <div
            className="rounded-2xl px-3 py-3"
            style={{
              background: 'rgba(255,255,255,0.16)',
              border: '1px solid rgba(255,255,255,0.28)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
          >
            <p className="text-[10px] uppercase tracking-wide text-white/65">Earned</p>
            <p className="mt-1 text-xl font-bold tabular-nums">Ƀ {formatBu(stats?.earned_bu ?? 0)}</p>
          </div>
          <div
            className="rounded-2xl px-3 py-3"
            style={{
              background: 'rgba(255,255,255,0.16)',
              border: '1px solid rgba(255,255,255,0.28)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
          >
            <p className="text-[10px] uppercase tracking-wide text-white/65">Friends joined</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{stats?.referral_count ?? 0}</p>
          </div>
        </div>
      </div>

      <div className="bu-glass space-y-3 rounded-[26px] p-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[#8b5cf6]" />
          <h2 className="text-sm font-semibold">Your invite tools</h2>
        </div>
        <div
          className="rounded-2xl px-3 py-3"
          style={{
            background: 'linear-gradient(165deg, rgba(255,255,255,0.95), rgba(239,244,255,0.9))',
            border: '1px solid rgba(47,123,255,0.18)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,1)',
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2f7bff]">Code</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate font-mono text-base font-bold tracking-wide">
              {stats?.code || '…'}
            </p>
            <button
              type="button"
              onClick={() => void copy('code')}
              className="bu-press inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
              style={copyBtnStyle}
            >
              {copied === 'code' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === 'code' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
        <div
          className="rounded-2xl px-3 py-3"
          style={{
            background: 'linear-gradient(165deg, rgba(255,255,255,0.95), rgba(239,244,255,0.9))',
            border: '1px solid rgba(47,123,255,0.18)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,1)',
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2f7bff]">Link</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm text-neutral-700">{shareLink || '…'}</p>
            <button
              type="button"
              onClick={() => void copy('link')}
              className="bu-press inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
              style={copyBtnStyle}
            >
              {copied === 'link' ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
              {copied === 'link' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      {message ? <p className="text-sm text-destructive">{message}</p> : null}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Recent referrals</h3>
        {!stats?.referrals?.length ? (
          <div className="bu-glass-soft rounded-2xl px-4 py-6 text-center text-sm text-muted-foreground">
            No referrals yet. Share your code to start earning.
          </div>
        ) : (
          stats.referrals.map((row) => {
            const paid = row.status === 'paid'
            return (
              <div key={row.id} className="bu-glass-soft flex items-center justify-between rounded-2xl px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold">+Ƀ {formatBu(row.reward_bu)}</p>
                  <p className="text-xs text-muted-foreground">
                    {paid
                      ? row.created_at
                        ? formatEventDateTime(row.created_at)
                        : 'Paid'
                      : `Waiting for friend to fund/spend Ƀ${formatBu(REFERRAL_QUALIFY_BU)}`}
                  </p>
                </div>
                <span
                  className={
                    paid
                      ? 'rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700'
                      : 'rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700'
                  }
                >
                  {paid ? 'Paid' : 'Pending'}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
