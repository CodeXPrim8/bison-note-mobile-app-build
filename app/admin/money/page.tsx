'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AreaChart, BarChart } from '@/components/web/area-chart'
import { formatNaira } from '@/lib/money'
import { adminFetch } from '@/components/admin/api'

type Overview = {
  rate: number
  paystack?: {
    ready: boolean
    naira: number | null
    currency: string
    error: string | null
  }
  totals: {
    circulation: number
    circulation_bu: number
    deposits: number
    withdrawals: number
    ticket_naira: number
    organiser_naira: number
    affiliate_naira: number
    pending_naira: number
    earned: number
    costs: number
    net: number
  }
  series: {
    deposits: number[]
    withdrawals: number[]
    tickets: number[]
    earned: number[]
    costs: number[]
  }
}

export default function AdminMoneyPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const overview = await adminFetch<Overview>('/api/admin/overview')
    setData(overview)
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message))
  }, [])

  async function refreshBalance() {
    try {
      setBusy(true)
      setError(null)
      const result = await adminFetch<{ paystack: Overview['paystack'] }>('/api/admin/settlement/topup', {
        method: 'POST',
        body: JSON.stringify({ action: 'refresh' }),
      })
      setData((prev) => (prev && result.paystack ? { ...prev, paystack: result.paystack } : prev))
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !data) return <p className="text-destructive">{error}</p>
  if (!data) return <p className="text-muted-foreground">Loading money…</p>

  const earned = data.totals.earned ?? 0
  const costs = data.totals.costs ?? 0
  const net = data.totals.net ?? earned - costs
  const earnedSeries = data.series.earned ?? []
  const costsSeries = data.series.costs ?? []

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300">Ledger</p>
        <h1 className="mt-1 text-3xl font-bold">Money</h1>
        <p className="text-sm text-muted-foreground">
          Platform P&amp;L, settlement, and cash movement. 1 ɃU = ₦{data.rate}.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="border-amber-400/20 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Settlement balance</p>
            <p className="mt-2 text-3xl font-bold">
              {data.paystack?.naira == null ? '—' : formatNaira(data.paystack.naira)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Paystack Transfers · bank payouts</p>
            {data.paystack?.error && <p className="mt-1 text-xs text-destructive">{data.paystack.error}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href="https://dashboard.paystack.com/#/balance" target="_blank" rel="noreferrer">
                Top up on Paystack
              </a>
            </Button>
            <Button variant="outline" onClick={refreshBalance} disabled={busy}>
              {busy ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-emerald-400/20 p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Making · 14 days</p>
          <p className="mt-2 text-3xl font-bold text-emerald-300">{formatNaira(earned)}</p>
        </Card>
        <Card className="border-rose-400/20 p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Losing · 14 days</p>
          <p className="mt-2 text-3xl font-bold text-rose-300">{formatNaira(costs)}</p>
        </Card>
        <Card className="border-amber-400/20 p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Net P&amp;L · 14 days</p>
          <p className={`mt-2 text-3xl font-bold ${net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatNaira(net)}</p>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-semibold">Making vs losing</h2>
        <p className="text-sm text-muted-foreground">Last 14 days</p>
        <div className="mt-4">
          <AreaChart
            points={earnedSeries.length ? earnedSeries : [0]}
            secondary={costsSeries.length ? costsSeries : [0]}
            accent="#34d399"
            secondaryAccent="#f43f5e"
          />
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['In circulation', formatNaira(data.totals.circulation)],
          ['Deposits · 14d', formatNaira(data.totals.deposits)],
          ['Withdrawals · 14d', formatNaira(data.totals.withdrawals)],
          ['Ticket credits', formatNaira(data.totals.ticket_naira)],
        ].map(([label, value]) => (
          <Card key={label} className="p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="font-semibold">Cash movement</h2>
        <p className="text-sm text-muted-foreground">Deposits vs withdrawals · 14 days</p>
        <AreaChart points={data.series.deposits} secondary={data.series.withdrawals} accent="#34d399" secondaryAccent="#f43f5e" />
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">Ticket naira</h2>
        <BarChart values={data.series.tickets} accent="#f59e0b" />
        <p className="mt-3 text-sm text-muted-foreground">
          Organisers {formatNaira(data.totals.organiser_naira)} · Affiliates {formatNaira(data.totals.affiliate_naira)} ·
          Pending {formatNaira(data.totals.pending_naira)}
        </p>
      </Card>
    </div>
  )
}
