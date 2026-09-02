'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Copy, Share2, TrendingUp, Ticket, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatNaira } from '@/lib/money'
import { AreaChart, BarChart } from '@/components/web/area-chart'
import { formatEventDay } from '@/lib/datetime'
import { publicShareOrigin } from '@/lib/brand'

interface Desk {
  roles: { is_affiliate: boolean; affiliate_code: string | null; is_organizer: boolean }
  wallet: { naira_available: number; bu_balance: number }
  earned: number
  sales_count: number
  series: Array<{ key: string; label: string; organiser: number; affiliate: number }>
  credits: Array<Record<string, unknown>>
  catalog: Array<{
    id: string
    title: string
    slug: string
    start_time: string
    venue_name: string | null
    cover_image_url: string | null
    commission_pct: number
    share_path: string
  }>
  origin: string
}

export default function AffiliateDeskPage() {
  const [data, setData] = useState<Desk | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/affiliate/desk', { credentials: 'include' })
    const json = await res.json()
    if (res.status === 401) {
      window.location.assign('/login?next=/affiliate')
      return
    }
    if (!json.status) {
      setError(json.message ?? 'Could not load affiliate desk')
      return
    }
    setData(json.data)
    setError(null)
  }

  useEffect(() => {
    void load()
  }, [])

  async function join() {
    setBusy(true)
    const res = await fetch('/api/account/roles', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'affiliate' }),
    })
    const json = await res.json()
    setBusy(false)
    if (!json.status) {
      setError(json.message)
      return
    }
    await load()
  }

  async function copy(path: string) {
    const url = `${publicShareOrigin()}${path}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(url)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setCopied(url)
    }
  }

  const points = useMemo(() => data?.series.map((item) => item.affiliate) ?? [], [data])
  const peak = Math.max(...points, 0)

  if (!data && !error) {
    return <p className="text-muted-foreground">Loading affiliate desk…</p>
  }

  if (data && !data.roles.is_affiliate) {
    return (
      <div className="relative mx-auto max-w-xl overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/15 via-background to-primary/10 p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300">Same ɃU account</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Sell tickets. Earn commission.</h1>
        <p className="mt-4 text-muted-foreground">
          Affiliate is not a new login. You keep this ɃU ID and this wallet. Organisers turn affiliate selling on per
          event and set the %. When someone buys through your link, that commission credits{' '}
          <span className="text-foreground">your</span> balance only — never another user’s.
        </p>
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        <Button className="mt-8" disabled={busy} onClick={() => void join()}>
          {busy ? 'Opening…' : 'Turn on affiliate on this account'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/20 via-background to-primary/20 p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300">Affiliate desk</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Your ticket desk</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Code <span className="font-mono text-foreground">{data?.roles.affiliate_code}</span> · same wallet as ɃU.
              Commission credits this balance and shows in history below.
            </p>
          </div>
          <div className="flex gap-2">
            {data?.roles.is_organizer && (
              <Button asChild variant="outline">
                <Link href="/organizer">Organiser</Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-emerald-400/20 bg-gradient-to-br from-emerald-500/15 to-transparent p-5">
          <div className="flex items-center gap-2 text-emerald-300">
            <TrendingUp className="h-4 w-4" />
            <p className="text-xs uppercase tracking-wider">Commission earned</p>
          </div>
          <p className="mt-3 text-3xl font-bold text-emerald-300">{formatNaira(data?.earned ?? 0)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Ticket className="h-4 w-4" />
            <p className="text-xs uppercase tracking-wider">Sales through your links</p>
          </div>
          <p className="mt-3 text-3xl font-bold">{data?.sales_count ?? 0}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <p className="text-xs uppercase tracking-wider">ɃU wallet</p>
          </div>
          <p className="mt-3 text-3xl font-bold">{formatNaira(data?.wallet.naira_available ?? 0)}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden border-white/10 p-0 lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <p className="font-semibold">Commission, last 14 days</p>
              <p className="text-xs text-muted-foreground">
                Peak day {formatNaira(peak)} · credits land on this account only
              </p>
            </div>
          </div>
          <div className="px-2 pb-2 pt-4">
            <AreaChart points={points.length ? points : [0, 0]} />
          </div>
          <div className="flex justify-between px-5 pb-4 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>{data?.series[0]?.label}</span>
            <span>{data?.series.at(-1)?.label}</span>
          </div>
        </Card>
        <Card className="p-5">
          <p className="font-semibold">Daily mix</p>
          <p className="mb-4 text-xs text-muted-foreground">Each bar is one day of commission</p>
          <BarChart values={points.length ? points : [0]} />
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-semibold">Events you can sell</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Organisers opt in and set the %. Share your link — buyers still check out on ɃU.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(data?.catalog ?? []).map((event) => (
            <Card key={event.id} className="overflow-hidden border-white/10 p-0">
              <div
                className="h-32 bg-cover bg-center bg-gradient-to-br from-primary/50 to-emerald-500/20"
                style={event.cover_image_url ? { backgroundImage: `url(${event.cover_image_url})` } : undefined}
              />
              <div className="space-y-3 p-4">
                <div>
                  <p className="font-semibold">{event.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatEventDay(event.start_time)}
                    {event.venue_name ? ` · ${event.venue_name}` : ''}
                  </p>
                </div>
                <p className="text-sm font-medium text-emerald-300">{event.commission_pct}% commission</p>
                <p className="break-all font-mono text-[11px] text-muted-foreground">
                  {publicShareOrigin()}
                  {event.share_path}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => void copy(event.share_path)}>
                    <Copy className="h-4 w-4" />
                    {copied?.endsWith(event.share_path) ? 'Copied' : 'Copy link'}
                  </Button>
                  <Button asChild variant="ghost">
                    <a href={`${publicShareOrigin()}${event.share_path}`} target="_blank" rel="noreferrer">
                      <Share2 className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {data?.catalog.length === 0 && (
            <p className="text-sm text-muted-foreground">No events are open to affiliates yet.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold">Recent commissions</h2>
        <div className="mt-3 space-y-2">
          {(data?.credits ?? []).map((row) => (
            <Card key={String(row.id)} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">Affiliate commission</p>
                <p className="text-xs text-muted-foreground">{String(row.created_at ?? '').replace('T', ' ').slice(0, 16)}</p>
              </div>
              <p className="font-semibold text-emerald-300">{formatNaira(Number(row.naira || 0))}</p>
            </Card>
          ))}
          {data?.credits.length === 0 && <p className="text-sm text-muted-foreground">No commissions yet. Share a link.</p>}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
