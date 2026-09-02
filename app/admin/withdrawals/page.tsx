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
  bank_code?: string | null
  account_number: string
  account_name: string
  status: string
  label?: string
  mode: string
  created_at: string
  transfer_error?: string | null
  paystack_reference?: string | null
  paid_at?: string | null
  user_name: string
  user_phone: string | null
}

export default function AdminWithdrawalsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [mode, setMode] = useState<'automatic' | 'manual'>('automatic')
  const [paystackReady, setPaystackReady] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    const data = await adminFetch<{
      withdrawals: Row[]
      settings: { withdrawal_mode: 'automatic' | 'manual' }
      paystack_ready: boolean
    }>('/api/admin/withdrawals')
    setRows(data.withdrawals)
    setMode(data.settings.withdrawal_mode)
    setPaystackReady(data.paystack_ready)
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

  async function act(id: string, action: 'approve' | 'reject' | 'retry') {
    try {
      setError(null)
      setBusyId(id)
      await adminFetch('/api/admin/withdrawals', { method: 'PATCH', body: JSON.stringify({ id, action }) })
      await load()
    } catch (err) {
      setError((err as Error).message)
      await load().catch(() => undefined)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300">Payouts</p>
        <h1 className="mt-1 text-3xl font-bold">Withdrawals</h1>
        <p className="text-sm text-muted-foreground">
          Automatic sends naira to the guest bank through Paystack Transfers as soon as they request it. Manual holds
          the request until you Approve. Enable Transfers on the live Paystack account and keep that balance funded.
        </p>
      </div>
      {!paystackReady && (
        <p className="text-sm text-destructive">
          Paystack is not configured. Add the live secret key on Vercel, enable Transfers, then redeploy.
        </p>
      )}
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
                  {row.user_phone} · {row.bank_name} · {row.account_name} · {row.account_number} · {row.label ?? row.status}
                </p>
                {row.paystack_reference && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Paystack {row.paystack_reference}</p>
                )}
                {row.transfer_error && <p className="mt-1 text-xs text-destructive">{row.transfer_error}</p>}
              </div>
              {row.status === 'pending' && (
                <div className="flex gap-2">
                  <Button size="sm" disabled={busyId === row.id} onClick={() => void act(row.id, 'approve')}>
                    {busyId === row.id ? 'Paying…' : 'Approve / pay'}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void act(row.id, 'reject')}>
                    Reject / refund
                  </Button>
                </div>
              )}
              {(row.status === 'payout_failed' || (row.status === 'approved' && !row.paystack_reference && !row.paid_at)) && (
                <div className="flex gap-2">
                  <Button size="sm" disabled={busyId === row.id} onClick={() => void act(row.id, 'retry')}>
                    {busyId === row.id ? 'Retrying…' : row.status === 'approved' ? 'Send payout' : 'Retry payout'}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void act(row.id, 'reject')}>
                    Refund
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
        {!rows.length && (
          <p className="text-muted-foreground">
            No withdrawals yet. Run 0016 then 0023 SQL if this stays empty after a guest requests payout.
          </p>
        )}
      </div>
    </div>
  )
}
