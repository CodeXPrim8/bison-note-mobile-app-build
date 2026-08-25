'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PublicShell } from '@/components/public-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Payment } from '@/lib/types/database'

export default function CheckoutPage() {
  const params = useParams<{ reference: string }>()
  const router = useRouter()
  const reference = params.reference
  const [payment, setPayment] = useState<Payment | null>(null)
  const [message, setMessage] = useState('Loading checkout…')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/payments/${reference}`)
      const json = (await res.json()) as { status: boolean; message?: string; data?: { payment: Payment } }
      if (!json.status || !json.data) {
        setMessage(json.message ?? 'Payment not found')
        return
      }
      const current = json.data.payment
      setPayment(current)
      if (current.status === 'success' || current.status === 'settled') {
        if (current.callback_url && current.callback_url.startsWith('http') && !current.callback_url.includes('/checkout/')) {
          window.location.href = `${current.callback_url}${current.callback_url.includes('?') ? '&' : '?'}reference=${reference}&status=success`
          return
        }
        router.replace(`/tickets?ref=${reference}`)
        return
      }
      if (current.authorization_url && current.authorization_url.includes('paystack')) {
        window.location.href = current.authorization_url
        return
      }
      setMessage('Confirm this demo payment to issue tickets. Live Paystack keys will redirect automatically.')
    }
    load().catch(() => setMessage('Could not load payment'))
  }, [reference, router])

  async function completeDemo() {
    setBusy(true)
    const response = await fetch('/api/payments/demo-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference }),
    })
    const json = (await response.json()) as { status: boolean; message: string }
    setBusy(false)
    if (json.status) router.replace(`/tickets?ref=${reference}`)
    else setMessage(json.message)
  }

  return (
    <PublicShell title="Checkout">
      <div className="px-4 py-8 space-y-4">
        <Card className="p-6 space-y-3">
          <h1 className="text-xl font-bold">BU Checkout</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          <p className="font-mono text-xs">{reference}</p>
          {payment && (
            <p className="text-lg font-bold text-primary">₦{Number(payment.amount).toLocaleString()}</p>
          )}
          <Button className="w-full" disabled={busy || !payment} onClick={completeDemo}>
            {busy ? 'Confirming…' : 'Complete demo payment'}
          </Button>
        </Card>
      </div>
    </PublicShell>
  )
}
