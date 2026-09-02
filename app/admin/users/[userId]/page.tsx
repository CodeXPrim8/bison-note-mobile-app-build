'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatNaira } from '@/lib/money'
import { adminFetch } from '@/components/admin/api'

type Detail = {
  user: Record<string, unknown> & {
    name?: string
    id: string
    role?: string
    roles?: string[]
    phone_number?: string
    email?: string
  }
  wallet: { naira: number; bu: number }
  roles: { is_organizer: boolean; is_affiliate: boolean; affiliate_code: string | null }
  control: { suspended: boolean; organizer_suspended: boolean; deleted_at: string | null; note: string | null }
  transactions: Array<Record<string, unknown>>
}

export default function AdminUserDetailPage() {
  const params = useParams<{ userId: string }>()
  const router = useRouter()
  const [data, setData] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [role, setRole] = useState('guest')
  const [note, setNote] = useState('')
  const [credit, setCredit] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    const next = await adminFetch<Detail>(`/api/admin/users/${params.userId}`)
    setData(next)
    setRole(String(next.user.role ?? 'guest'))
    setNote(next.control.note ?? '')
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.userId])

  async function patch(body: Record<string, unknown>, ok = 'Saved') {
    setError(null)
    try {
      await adminFetch(`/api/admin/users/${params.userId}`, { method: 'PATCH', body: JSON.stringify(body) })
      setMessage(ok)
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function removeUser() {
    if (!window.confirm('Remove this user from ɃU? They will not be able to sign in.')) return
    try {
      await adminFetch(`/api/admin/users/${params.userId}`, { method: 'DELETE' })
      router.push('/admin/users')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (error && !data) return <p className="text-destructive">{error}</p>
  if (!data) return <p className="text-muted-foreground">Loading user…</p>

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300">Customer lookup</p>
        <h1 className="mt-1 text-3xl font-bold">{data.user.name}</h1>
        <p className="text-sm text-muted-foreground">
          {data.user.phone_number} · {data.user.email || 'no email'}
        </p>
        <div className="mt-3 flex flex-wrap gap-1">
          {(Array.isArray(data.user.roles) && data.user.roles.length
            ? data.user.roles
            : [
                data.roles.is_super_admin ? 'Super Admin' : null,
                data.roles.is_organizer ? 'Organiser' : null,
                data.roles.is_affiliate ? 'Affiliate' : null,
                !data.roles.is_organizer && !data.roles.is_affiliate && !data.roles.is_super_admin ? 'Guest' : null,
              ].filter(Boolean)
          ).map((label) => (
            <span
              key={String(label)}
              className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200"
            >
              {String(label)}
            </span>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-emerald-300">{message}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Balance</p>
          <p className="mt-2 text-3xl font-bold">{formatNaira(data.wallet.naira)}</p>
          <p className="text-sm text-muted-foreground">{data.wallet.bu.toLocaleString()} ɃU</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Account roles</p>
          <p className="mt-2 text-sm">
            {data.roles.is_organizer ? 'Organiser' : 'Not organiser'} · {data.roles.is_affiliate ? `Affiliate ${data.roles.affiliate_code}` : 'Not affiliate'}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Status</p>
          <p className="mt-2 text-sm">
            {data.control.deleted_at ? 'Removed' : data.control.suspended ? 'Suspended' : 'Active'}
            {data.control.organizer_suspended ? ' · organiser frozen' : ''}
          </p>
        </Card>
      </div>
      <Card className="space-y-3 p-6">
        <h2 className="font-semibold">Controls</h2>
        <div className="flex flex-wrap gap-2">
          <select className="rounded-md border bg-background px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
            {['guest', 'celebrant', 'vendor', 'merchant', 'organizer'].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => void patch({ role }, 'Role updated')}>
            Change role
          </Button>
          <Button variant="outline" onClick={() => void patch({ organizer: true }, 'Organiser enabled')}>
            Make organiser
          </Button>
          <Button variant="outline" onClick={() => void patch({ affiliate: true }, 'Affiliate enabled')}>
            Make affiliate
          </Button>
          <Button variant="outline" onClick={() => void patch({ suspended: !data.control.suspended }, data.control.suspended ? 'Unsuspended' : 'Suspended')}>
            {data.control.suspended ? 'Unsuspend' : 'Suspend account'}
          </Button>
          <Button
            variant="outline"
            onClick={() => void patch({ organizer_suspended: !data.control.organizer_suspended }, 'Organiser updated')}
          >
            {data.control.organizer_suspended ? 'Unfreeze organiser' : 'Suspend organiser'}
          </Button>
          <Button variant="destructive" onClick={() => void removeUser()}>
            Delete from ɃU
          </Button>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Internal note" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button variant="outline" onClick={() => void patch({ note }, 'Note saved')}>
            Save note
          </Button>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Adjust naira (use minus to debit)"
            value={credit}
            onChange={(e) => setCredit(e.target.value)}
          />
          <Button
            onClick={() => {
              const naira = Number(credit)
              if (!Number.isFinite(naira) || naira === 0) return
              void patch({ credit_naira: naira }, 'Wallet adjusted')
              setCredit('')
            }}
          >
            Adjust wallet
          </Button>
        </div>
      </Card>
      <Card className="p-6">
        <h2 className="font-semibold">History</h2>
        <div className="mt-3 space-y-2 text-sm">
          {data.transactions.length === 0 && <p className="text-muted-foreground">No wallet history.</p>}
          {data.transactions.map((row) => (
            <div key={String(row.id)} className="flex justify-between border-b border-white/5 py-2">
              <span>
                {String(row.type)} · {String(row.description ?? '')}
              </span>
              <span>{formatNaira(Number(row.amount || 0))}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
