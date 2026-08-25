'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowRight } from 'lucide-react'

interface BuyBUProps {
  onComplete?: (amount: number) => void
}

export default function BuyBU({ onComplete: _onComplete }: BuyBUProps) {
  const [step, setStep] = useState<'conversion' | 'checkout'>('conversion')
  const [nairaAmount, setNairaAmount] = useState('')
  const [buAmount, setBUAmount] = useState(0)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const conversionRate = 1

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (json.data?.user?.email) setEmail(json.data.user.email)
      })
      .catch(() => undefined)
  }, [])

  const handleConvert = () => {
    if (nairaAmount && !isNaN(Number(nairaAmount)) && Number(nairaAmount) > 0) {
      setBUAmount(Math.floor(Number(nairaAmount) / conversionRate))
      setStep('checkout')
    }
  }

  async function handleCheckout() {
    if (!email) {
      setMessage('Add an email on your account to fund this wallet.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, amount: Number(nairaAmount) }),
      })
      const json = await res.json()
      setBusy(false)
      if (!json.status) {
        setMessage(json.message ?? 'Could not start Paystack checkout')
        return
      }
      window.location.assign(json.data.authorization_url)
    } catch {
      setBusy(false)
      setMessage('Could not reach ɃU.')
    }
  }

  if (step === 'conversion') {
    return (
      <div className="space-y-6 pb-24 pt-4">
        <div className="px-4">
          <h2 className="text-xl font-bold mb-4">Buy ɃU</h2>
          <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-6 mb-4">
            <div className="space-y-2">
              <h3 className="font-semibold">Conversion Rate</h3>
              <p className="text-2xl font-bold text-primary">1 Ƀ = ₦1</p>
              <p className="text-sm text-muted-foreground">
                Enter the amount in Naira you want to convert to ɃU
              </p>
            </div>
          </Card>
          <Card className="border-primary/20 bg-card p-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold">Amount in Naira (₦)</label>
                <Input
                  type="number"
                  placeholder="Enter amount"
                  value={nairaAmount}
                  onChange={(e) => setNairaAmount(e.target.value)}
                  className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                />
              </div>
              {nairaAmount && !isNaN(Number(nairaAmount)) && Number(nairaAmount) > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">You will receive:</span>
                    <span className="text-xl font-bold text-primary">
                      Ƀ {Math.floor(Number(nairaAmount) / conversionRate).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
              <Button
                onClick={handleConvert}
                disabled={!nairaAmount || isNaN(Number(nairaAmount)) || Number(nairaAmount) <= 0}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Proceed to Checkout
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-24 pt-4">
      <div className="px-4">
        <div className="mb-4">
          <Button onClick={() => setStep('conversion')} variant="outline" className="w-full">
            ← Back
          </Button>
        </div>
        <h2 className="text-xl font-bold mb-4">Checkout</h2>
        <Card className="border-primary/20 bg-card p-6 mb-4">
          <h3 className="font-semibold mb-4">Order Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount:</span>
              <span className="font-semibold">₦{Number(nairaAmount).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bison Units:</span>
              <span className="font-bold text-primary">Ƀ {buAmount.toLocaleString()}</span>
            </div>
          </div>
        </Card>
        <p className="text-sm text-muted-foreground mb-4">
          Payment is completed on Paystack. ɃU is credited after the webhook confirms the charge.
        </p>
        {message && <p className="text-sm text-destructive mb-3">{message}</p>}
        <Button
          onClick={() => void handleCheckout()}
          disabled={busy}
          className="w-full bg-primary py-6 text-primary-foreground hover:bg-primary/90"
        >
          {busy ? 'Opening Paystack…' : 'Pay with Paystack'}
        </Button>
      </div>
    </div>
  )
}
