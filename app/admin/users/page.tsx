'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatNaira } from '@/lib/money'
import { adminFetch } from '@/components/admin/api'

type UserRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string
  roles: string[]
  is_organizer: boolean
  is_affiliate: boolean
  is_super_admin: boolean
  affiliate_code: string | null
  naira: number
  bu: number
  suspended: boolean
  organizer_suspended: boolean
  deleted: boolean
}

const ROLE_FILTERS = [
  { id: '', label: 'All' },
  { id: 'guest', label: 'Guest' },
  { id: 'organizer', label: 'Organiser' },
  { id: 'affiliate', label: 'Affiliate' },
] as const

function statusLabel(row: UserRow) {
  if (row.deleted) return 'Removed'
  if (row.suspended) return 'Suspended'
  if (row.organizer_suspended) return 'Organiser frozen'
  return 'Active'
}

export default function AdminUsersPage() {
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ phone: '', first_name: '', last_name: '', pin: '1234', role: 'guest' })

  async function load(query = q, roleFilter = role) {
    const data = await adminFetch<{ users: UserRow[]; total: number }>(
      `/api/admin/users?q=${encodeURIComponent(query)}&role=${encodeURIComponent(roleFilter)}`,
    )
    setUsers(data.users)
    setTotal(data.total)
    setLoading(false)
  }

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setError(null)
      load(q, role).catch((err: Error) => {
        setError(err.message)
        setLoading(false)
      })
    }, q ? 250 : 0)
    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, role])

  async function createUser() {
    setBusy(true)
    setError(null)
    try {
      await adminFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(form) })
      setForm({ phone: '', first_name: '', last_name: '', pin: '1234', role: 'guest' })
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300">People</p>
        <h1 className="mt-1 text-3xl font-bold">Users</h1>
        <p className="text-sm text-muted-foreground">
          Every ɃU account, with guest / organiser / affiliate roles. Search by name, phone, ɃU ID, or email.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Input
          placeholder="Search a user — name, phone, email, ɃU ID, or affiliate code"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {ROLE_FILTERS.map((item) => (
            <Button
              key={item.id || 'all'}
              size="sm"
              variant={role === item.id ? 'default' : 'outline'}
              onClick={() => setRole(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        {loading ? 'Loading directory…' : `${total} account${total === 1 ? '' : 's'}${q || role ? ' match this search' : ''}`}
      </p>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-card/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">ɃU ID</th>
              <th className="px-4 py-3">Roles</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.id} className="border-t border-white/5">
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${row.id}`} className="font-medium hover:text-amber-300">
                    {row.name}
                  </Link>
                  {row.email ? <p className="text-xs text-muted-foreground">{row.email}</p> : null}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{row.phone || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(row.roles?.length ? row.roles : [row.role || 'Guest']).map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">{formatNaira(row.naira)}</td>
                <td className="px-4 py-3 text-xs">{statusLabel(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !users.length && !error ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">
            {q || role ? 'No user matches that search.' : 'No accounts found yet.'}
          </p>
        ) : null}
      </div>
      <Card className="space-y-3 p-6">
        <h2 className="font-semibold">Add a user</h2>
        <div className="grid gap-2 md:grid-cols-2">
          <Input placeholder="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          <Input placeholder="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          <Input placeholder="ɃU ID (phone)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input placeholder="PIN" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
        </div>
        <Button disabled={busy} onClick={() => void createUser()}>
          {busy ? 'Creating…' : 'Create user'}
        </Button>
      </Card>
    </div>
  )
}
