'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { Payment } from '@/lib/types/database'

type WalletTx = {
  id: string
  type: string
  amount: number
  description: string
  created_at: string
}

export default function TransactionsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [credits, setCredits] = useState<WalletTx[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/organizer/payments', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (json.status) {
          setPayments(
            [...(json.data ?? [])].sort(
              (a: Payment, b: Payment) => Date.parse(b.created_at || '') - Date.parse(a.created_at || ''),
            ),
          )
        }
        else setError(json.message)
      })
      .catch(() => setError('Could not load transactions'))
    fetch('/api/wallet', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) return
        const txs = (json.data?.transactions ?? []) as WalletTx[]
        setCredits(
          txs
            .filter(
              (tx) => tx.description === 'Ticket sale' || tx.description === 'Affiliate commission',
            )
            .sort((a, b) => Date.parse(b.created_at || '') - Date.parse(a.created_at || '')),
        )
      })
      .catch(() => undefined)
  }, [])

  const filtered = payments.filter((payment) => {
    const hay = `${payment.reference} ${payment.buyer_email} ${payment.buyer_name} ${payment.status}`.toLowerCase()
    return hay.includes(query.toLowerCase())
  })

  return (
    <div>
      <h1 className="text-3xl font-bold">Transactions</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ticket charges from guests, and the credits that landed on this ɃU wallet.
      </p>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <h2 className="mt-8 text-xl font-semibold">Wallet credits</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ticket sales and affiliate commission that increased your account balance.
      </p>
      <div className="mt-3 space-y-2">
        {credits.map((tx) => (
          <Card key={tx.id} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium">{tx.description}</p>
              <p className="text-xs text-muted-foreground">{String(tx.created_at ?? '').replace('T', ' ').slice(0, 16)}</p>
            </div>
            <p className="font-semibold">₦{Number(tx.amount).toLocaleString()}</p>
          </Card>
        ))}
        {credits.length === 0 && (
          <p className="text-sm text-muted-foreground">No wallet credits yet. They appear after a guest pays.</p>
        )}
      </div>

      <h2 className="mt-8 text-xl font-semibold">Paystack charges</h2>
      <Input className="mt-4" placeholder="Search reference, email, status" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="mt-4 space-y-2">
        {filtered.map((payment) => (
          <Card key={payment.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-sm">{payment.reference}</p>
                <p className="text-sm text-muted-foreground">
                  {payment.buyer_name ?? payment.buyer_email} · ₦{Number(payment.amount).toLocaleString()}
                </p>
              </div>
              <span className="text-xs uppercase text-primary">{payment.status}</span>
            </div>
            {payment.event_id && (
              <Link href={`/organizer/events/${payment.event_id}`} className="mt-2 inline-block text-xs text-primary">
                View event
              </Link>
            )}
          </Card>
        ))}
        {filtered.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">No Paystack charges yet.</p>
        )}
      </div>
    </div>
  )
}
