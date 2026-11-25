'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatNaira } from '@/lib/money'
import { adminFetch } from '@/components/admin/api'

type SenderRow = {
  user_id: string
  name: string
  phone: string | null
  email: string | null
  send_count: number
  total_bu: number
  total_naira: number
  active_days: number
  last_sent_at: string | null
}

type ActivityPayload = {
  window_days: number
  scanned: number
  senders: SenderRow[]
}

const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const

function formatWhen(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-NG', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function AdminActivityPage() {
  const [days, setDays] = useState<number>(30)
  const [data, setData] = useState<ActivityPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    adminFetch<ActivityPayload>(`/api/admin/activity/senders?days=${days}&limit=50`)
      .then((payload) => {
        if (!cancelled) setData(payload)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [days])

  const top = data?.senders?.[0] ?? null

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300">Engagement</p>
        <h1 className="mt-1 text-3xl font-bold">Who uses ɃU most</h1>
        <p className="text-sm text-muted-foreground">
          Ranked by peer send transactions (transfers, tips, event sprays) — not bank withdrawals. Use this to spot
          people treating ɃU as their main send app.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {WINDOWS.map((item) => (
          <Button
            key={item.days}
            size="sm"
            variant={days === item.days ? 'default' : 'outline'}
            onClick={() => setDays(item.days)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {top ? (
        <Card className="border-amber-400/20 bg-gradient-to-br from-amber-500/10 via-card/60 to-transparent p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-amber-500/15 p-2 text-amber-300">
              <Activity className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Most active sender · last {days}d</p>
              <Link href={`/admin/users/${top.user_id}`} className="mt-1 block text-2xl font-bold hover:text-amber-300">
                {top.name}
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">
                {top.send_count} sends · {top.active_days} active day{top.active_days === 1 ? '' : 's'} ·{' '}
                {top.total_bu.toLocaleString('en-NG', { maximumFractionDigits: 2 })} ɃU (
                {formatNaira(top.total_naira)})
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-card/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Sends</th>
              <th className="px-4 py-3">Active days</th>
              <th className="px-4 py-3">Volume</th>
              <th className="px-4 py-3">Last send</th>
            </tr>
          </thead>
          <tbody>
            {(data?.senders ?? []).map((row, index) => (
              <tr key={row.user_id} className="border-t border-white/5">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{index + 1}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${row.user_id}`} className="font-medium hover:text-amber-300">
                    {row.name}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">{row.phone || row.email || '—'}</p>
                </td>
                <td className="px-4 py-3 font-semibold">{row.send_count}</td>
                <td className="px-4 py-3">{row.active_days}</td>
                <td className="px-4 py-3">
                  <p>{row.total_bu.toLocaleString('en-NG', { maximumFractionDigits: 2 })} ɃU</p>
                  <p className="text-xs text-muted-foreground">{formatNaira(row.total_naira)}</p>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatWhen(row.last_sent_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <p className="px-4 py-8 text-sm text-muted-foreground">Loading send activity…</p> : null}
        {!loading && !error && !(data?.senders?.length) ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">
            No peer send transactions in the last {days} days.
          </p>
        ) : null}
      </div>

      {data ? (
        <p className="text-xs text-muted-foreground">
          Ranked by send count, then active days, then volume. Scanned {data.scanned.toLocaleString()} wallet movements
          in this window.
        </p>
      ) : null}
    </div>
  )
}
