'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatNaira } from '@/lib/money'
import { adminFetch } from '@/components/admin/api'

type Row = {
  id: string
  user_id: string
  bu: number
  naira: number
  bank_name: string
  account_number: string
  account_name: string
  status: string
  mode: string
  created_at: string
  user_name: string
  user_phone: string | null
}

export default function AdminWithdrawalsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [mode, setMode] = useState<'automatic' | 'manual'>('automatic')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const data = await adminFetch<{ withdrawals: Row[]; settings: { withdrawal_mode: 'automatic' | 'manual' } }>(
      '/api/admin/withdrawals',
    )
    setRows(data.withdrawals)
    setMode(data.settings.withdrawal_mode)
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message))
  }, [])

  async function setWithdrawalMode(next: 'automatic' | 'manual') {
    try {
      setError(null)
      await adminFetch('/api/admin/withdrawals', { method: 'PATCH', body: JSON.stringify({ withdrawal_mode: next }) })
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function act(id: string, action: 'approve' | 'reject') {
    try {
      await adminFetch('/api/admin/withdrawals', { method: 'PATCH', body: JSON.stringify({ id, action }) })
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300">Payouts</p>
        <h1 className="mt-1 text-3xl font-bold">Withdrawals</h1>
        <p className="text-sm text-muted-foreground">
          Manual holds cash in a queue until you approve. Automatic pays as soon as the guest requests it.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button variant={mode === 'automatic' ? 'default' : 'outline'} onClick={() => void setWithdrawalMode('automatic')}>
          Automatic
        </Button>
        <Button variant={mode === 'manual' ? 'default' : 'outline'} onClick={() => void setWithdrawalMode('manual')}>
          Manual approval
        </Button>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <Card key={row.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {row.user_name} · {formatNaira(Number(row.naira))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.user_phone} · {row.bank_name} · {row.account_name} · {row.account_number} · {row.status}
                </p>
              </div>
              {row.status === 'pending' && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void act(row.id, 'approve')}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void act(row.id, 'reject')}>
                    Reject / refund
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
        {!rows.length && <p className="text-muted-foreground">No withdrawals yet. Run 0016 SQL if this stays empty after requests.</p>}
      </div>
    </div>
  )
}
