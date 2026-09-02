'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, Wallet, Ticket, Landmark, TrendingUp, Banknote } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AreaChart, BarChart } from '@/components/web/area-chart'
import { formatNaira } from '@/lib/money'
import { adminFetch } from '@/components/admin/api'

type Overview = {
  viewer: string
  rate: number
  settings: { bu_naira_value: number; withdrawal_mode: string }
  paystack?: {
    ready: boolean
    naira: number | null
    currency: string
    error: string | null
  }
  totals: {
    users: number
    circulation: number
    circulation_bu: number
    deposits: number
    withdrawals: number
    pending_withdrawals: number
    pending_naira: number
    events: number
    public_events: number
    suspended: number
    ads_live: number
    organiser_naira: number
    affiliate_naira: number
    ticket_naira: number
  }
  series: {
    days: string[]
    deposits: number[]
    withdrawals: number[]
    tickets: number[]
    organiser: number[]
    affiliate: number[]
  }
}

const LINKS = [
  { href: '/admin/users', label: 'Users', hint: 'Lookup, edit, suspend, delete' },
  { href: '/admin/events', label: 'Events', hint: 'Unpublish parties, freeze organisers' },
  { href: '/admin/withdrawals', label: 'Withdrawals', hint: 'Approve, reject, auto or manual' },
  { href: '/admin/ads', label: 'Adverts', hint: 'App and website placements' },
  { href: '/admin/rates', label: 'ɃU rate', hint: 'Raise or cut ɃU to naira' },
  { href: '/admin/money', label: 'Money', hint: 'Circulation, tickets, wallets' },
]

export default function SuperAdminPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminFetch<Overview>('/api/admin/overview')
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [])

  if (error && !data) {
    return (
      <div className="mx-auto max-w-lg space-y-3">
        <h1 className="text-3xl font-bold">Super Admin</h1>
        <p className="text-muted-foreground">{error}</p>
      </div>
    )
  }

  if (!data) return <p className="text-muted-foreground">Loading command center…</p>

  const kpis = [
    { label: 'Money in circulation', value: formatNaira(data.totals.circulation), hint: `${Math.round(data.totals.circulation_bu).toLocaleString()} ɃU`, icon: Wallet },
    {
      label: 'Paystack balance',
      value: data.paystack?.naira == null ? '—' : formatNaira(data.paystack.naira),
      hint: data.paystack?.error ?? 'Live Transfers wallet',
      icon: Banknote,
    },
    { label: 'Users', value: data.totals.users.toLocaleString(), hint: `${data.totals.suspended} suspended`, icon: Users },
    { label: 'Ticket volume', value: formatNaira(data.totals.ticket_naira), hint: 'Organiser + affiliate credits', icon: Ticket },
    { label: 'Pending payouts', value: String(data.totals.pending_withdrawals), hint: formatNaira(data.totals.pending_naira), icon: Landmark },
  ]

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-[2rem] border border-amber-400/20 bg-gradient-to-br from-amber-500/20 via-background to-primary/20 p-6 md:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-amber-300">Super Admin</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">Command center</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Signed in as {data.viewer}. You control users, events, money, withdrawals, adverts, and the ɃU-to-naira rate.
          1 ɃU = ₦{data.rate.toLocaleString('en-NG')} · withdrawals {data.settings.withdrawal_mode}.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {LINKS.map((item) => (
            <Button key={item.href} asChild variant="outline" size="sm">
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((item) => (
          <Card key={item.label} className="border-white/10 bg-card/60 p-5">
            <div className="flex items-center gap-2 text-amber-300">
              <item.icon className="h-4 w-4" />
              <p className="text-xs uppercase tracking-wider">{item.label}</p>
            </div>
            <p className="mt-3 text-3xl font-bold">{item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-white/10 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Deposits vs withdrawals</p>
              <h2 className="text-lg font-semibold">Last 14 days</h2>
            </div>
            <TrendingUp className="h-4 w-4 text-emerald-300" />
          </div>
          <div className="mt-4">
            <AreaChart points={data.series.deposits} secondary={data.series.withdrawals} accent="#34d399" secondaryAccent="#f43f5e" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Green = deposits · Rose = withdrawals</p>
        </Card>
        <Card className="border-white/10 p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Ticket split</p>
          <h2 className="text-lg font-semibold">Organiser vs affiliate</h2>
          <div className="mt-4">
            <AreaChart points={data.series.organiser} secondary={data.series.affiliate} accent="#f59e0b" secondaryAccent="#34d399" />
          </div>
          <div className="mt-4">
            <BarChart values={data.series.tickets} accent="#f59e0b" />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Public events live</p>
          <p className="mt-2 text-3xl font-bold">{data.totals.public_events}</p>
          <p className="text-xs text-muted-foreground">{data.totals.events} total events</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Live adverts</p>
          <p className="mt-2 text-3xl font-bold">{data.totals.ads_live}</p>
          <Button asChild variant="ghost" className="mt-2 px-0">
            <Link href="/admin/ads">Manage placements</Link>
          </Button>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Card deposits recorded</p>
          <p className="mt-2 text-3xl font-bold">{formatNaira(data.totals.deposits)}</p>
          <p className="text-xs text-muted-foreground">Withdrawn {formatNaira(data.totals.withdrawals)}</p>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-2xl border border-white/10 bg-card/40 p-5 transition hover:border-amber-400/40 hover:bg-amber-500/5"
          >
            <p className="font-semibold">{item.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.hint}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
