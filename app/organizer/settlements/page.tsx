'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import type { Payment } from '@/lib/types/database'

export default function SettlementsPage() {
  const [payments, setPayments] = useState<Payment[]>([])

  useEffect(() => {
    fetch('/api/organizer/payments')
      .then(async (res) => {
        const json = await res.json()
        if (json.status) setPayments(json.data ?? [])
      })
      .catch(() => undefined)
  }, [])

  const successful = payments.filter((p) => p.status === 'success' || p.status === 'settled')
  const total = successful.reduce((sum, p) => sum + Number(p.amount), 0)

  return (
    <div>
      <h1 className="text-3xl font-bold">Settlements</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        ɃU routes ticket money through Paystack. Connect a subaccount when creating a Gateway merchant to settle
        organisers automatically. Physical Bison Notes never settle — they have no financial value.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Confirmed ticket revenue</p>
          <p className="mt-2 text-2xl font-bold">₦{total.toLocaleString()}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Successful charges</p>
          <p className="mt-2 text-2xl font-bold">{successful.length}</p>
        </Card>
      </div>
      <div className="mt-6 space-y-2">
        {successful.map((payment) => (
          <Card key={payment.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-mono text-sm">{payment.reference}</p>
              <p className="text-xs text-muted-foreground">{new Date(payment.created_at).toLocaleString()}</p>
            </div>
            <p className="font-semibold">₦{Number(payment.amount).toLocaleString()}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}
