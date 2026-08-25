'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { Payment } from '@/lib/types/database'

export default function TransactionsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/organizer/payments', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (json.status) setPayments(json.data ?? [])
        else setError(json.message)
      })
      .catch(() => setError('Could not load transactions'))
  }, [])

  const filtered = payments.filter((payment) => {
    const hay = `${payment.reference} ${payment.buyer_email} ${payment.buyer_name} ${payment.status}`.toLowerCase()
    return hay.includes(query.toLowerCase())
  })

  return (
    <div>
      <h1 className="text-3xl font-bold">Transactions</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Paystack-backed ticket charges for your events. Status is confirmed server-side, never from a browser redirect.
      </p>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
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
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        )}
      </div>
    </div>
  )
}
