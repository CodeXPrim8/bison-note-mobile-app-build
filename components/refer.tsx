'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { Check, Copy, Link2, Users } from 'lucide-react'
import { formatBu } from '@/lib/bu-rate'
import { formatEventDateTime } from '@/lib/datetime'
import { REFERRAL_REWARD_BU } from '@/lib/referrals-shared'

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

  return (
    <div className="space-y-4 bg-transparent px-4 pb-28 pt-4 text-neutral-950">
      <div
        className="relative overflow-hidden rounded-[30px] p-5 text-white"
        style={{
          background: 'linear-gradient(165deg, #2a6fe0 0%, #1f5fd0 42%, #174db8 100%)',
          boxShadow:
            '0 18px 40px rgba(11,23,51,0.26), inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(0,0,0,0.12)',
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/35" />
        <div className="relative flex items-start gap-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white/15 ring-1 ring-white/25">
            <Image src="/refer-campaign.png" alt="" fill className="object-cover" sizes="64px" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/55">Invite & earn</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Refer friends</h1>
            <p className="mt-1 text-sm text-white/75">
              Earn Ƀ{formatBu(REFERRAL_REWARD_BU)} when someone joins with your code.
            </p>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-2">
          <div className="bu-glass-dark rounded-2xl px-3 py-3">
            <p className="text-[10px] uppercase tracking-wide text-white/55">Earned</p>
            <p className="mt-1 text-xl font-bold tabular-nums">Ƀ {formatBu(stats?.earned_bu ?? 0)}</p>
          </div>
          <div className="bu-glass-dark rounded-2xl px-3 py-3">
            <p className="text-[10px] uppercase tracking-wide text-white/55">Friends joined</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{stats?.referral_count ?? 0}</p>
          </div>
        </div>
      </div>

      <div className="bu-glass space-y-3 rounded-[26px] p-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-neutral-500" />
          <h2 className="text-sm font-semibold">Your invite tools</h2>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/55 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Code</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate font-mono text-base font-bold tracking-wide">
              {stats?.code || '…'}
            </p>
            <button
              type="button"
              onClick={() => void copy('code')}
              className="bu-press inline-flex items-center gap-1 rounded-full bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white"
            >
              {copied === 'code' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === 'code' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/55 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Link</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm text-neutral-700">{shareLink || '…'}</p>
            <button
              type="button"
              onClick={() => void copy('link')}
              className="bu-press inline-flex items-center gap-1 rounded-full bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white"
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
          stats.referrals.map((row) => (
            <div key={row.id} className="bu-glass-soft flex items-center justify-between rounded-2xl px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold">+Ƀ {formatBu(row.reward_bu)}</p>
                <p className="text-xs text-muted-foreground">
                  {row.created_at ? formatEventDateTime(row.created_at) : 'Paid'}
                </p>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                {row.status}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
