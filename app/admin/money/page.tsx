'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { AreaChart, BarChart } from '@/components/web/area-chart'
import { formatNaira } from '@/lib/money'
import { adminFetch } from '@/components/admin/api'

type Overview = {
  rate: number
  totals: {
    circulation: number
    circulation_bu: number
    deposits: number
    withdrawals: number
    ticket_naira: number
    organiser_naira: number
    affiliate_naira: number
    pending_naira: number
  }
  series: { deposits: number[]; withdrawals: number[]; tickets: number[] }
}

export default function AdminMoneyPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminFetch<Overview>('/api/admin/overview')
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [])

  if (error) return <p className="text-destructive">{error}</p>
  if (!data) return <p className="text-muted-foreground">Loading money…</p>

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300">Ledger</p>
        <h1 className="mt-1 text-3xl font-bold">Money</h1>
        <p className="text-sm text-muted-foreground">Every naira sitting in ɃU wallets, plus ticket and payout flow. Rate 1 ɃU = ₦{data.rate}.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['In circulation', formatNaira(data.totals.circulation)],
          ['Deposits', formatNaira(data.totals.deposits)],
          ['Withdrawals', formatNaira(data.totals.withdrawals)],
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
        <AreaChart points={data.series.deposits} secondary={data.series.withdrawals} accent="#34d399" secondaryAccent="#f43f5e" />
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">Ticket naira</h2>
        <BarChart values={data.series.tickets} accent="#f59e0b" />
        <p className="mt-3 text-sm text-muted-foreground">
          Organisers {formatNaira(data.totals.organiser_naira)} · Affiliates {formatNaira(data.totals.affiliate_naira)} ·
          Pending payouts {formatNaira(data.totals.pending_naira)}
        </p>
      </Card>
    </div>
  )
}
