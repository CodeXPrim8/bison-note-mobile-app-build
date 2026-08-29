'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowRight } from 'lucide-react'
import {
  BU_BUY_PRESETS,
  BU_MIN_PURCHASE,
  BU_NAIRA_VALUE,
  BuyQuoteError,
  cardBuyRate,
  formatBu,
  formatNairaPlain,
  formatNairaRate,
  minPurchaseChargeNaira,
  quoteBuyBu,
  quoteBuyFromChargeNaira,
} from '@/lib/bu-rate'

interface BuyBUProps {
  onComplete?: (amount: number) => void
}

export default function BuyBU({ onComplete: _onComplete }: BuyBUProps) {
  const [step, setStep] = useState<'conversion' | 'checkout'>('conversion')
  const [mode, setMode] = useState<'bu' | 'naira'>('bu')
  const [buInput, setBuInput] = useState('')
  const [nairaInput, setNairaInput] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const buyRate = cardBuyRate()

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (json.data?.user) {
          setEmail(json.data.profile?.email || json.data.user.email || '')
        }
      })
      .catch(() => undefined)
  }, [])

  const quote = useMemo(() => {
    try {
      if (mode === 'bu') {
        const bu = Number(buInput)
        if (!buInput || Number.isNaN(bu) || bu <= 0) return null
        return quoteBuyBu(bu)
      }
      const naira = Number(nairaInput)
      if (!nairaInput || Number.isNaN(naira) || naira <= 0) return null
      return quoteBuyFromChargeNaira(naira)
    } catch (error) {
      if (error instanceof BuyQuoteError) return { error: error.message }
      return { error: 'Enter a valid amount' }
    }
  }, [mode, buInput, nairaInput])

  const readyQuote = quote && !('error' in quote) ? quote : null
  const quoteError = quote && 'error' in quote ? quote.error : null

  async function handleCheckout() {
    if (!readyQuote) return
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
        body: JSON.stringify({ email, bu: readyQuote.bu }),
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
              <h3 className="font-semibold">Rates</h3>
              <p className="text-2xl font-bold text-primary">1 ɃU = ₦{BU_NAIRA_VALUE.toLocaleString('en-NG')} to spray or withdraw</p>
              <p className="text-sm text-muted-foreground">
                Card price ₦{formatNairaRate(buyRate)} (5%) · covers Paystack collection and bank payouts · minimum{' '}
                {BU_MIN_PURCHASE.toLocaleString('en-NG')} ɃU (₦{formatNairaPlain(minPurchaseChargeNaira())})
              </p>
            </div>
          </Card>
          <Card className="border-primary/20 bg-card p-6">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={mode === 'bu' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setMode('bu')}
                >
                  Enter ɃU
                </Button>
                <Button
                  type="button"
                  variant={mode === 'naira' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setMode('naira')}
                >
                  Enter ₦ to pay
                </Button>
              </div>
              {mode === 'bu' ? (
                <div>
                  <label className="text-sm font-semibold">Amount in ɃU</label>
                  <Input
                    type="number"
                    min={BU_MIN_PURCHASE}
                    step="1"
                    placeholder={`Minimum ${BU_MIN_PURCHASE.toLocaleString('en-NG')} ɃU`}
                    value={buInput}
                    onChange={(e) => setBuInput(e.target.value)}
                    className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {BU_BUY_PRESETS.map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        size="sm"
                        variant={buInput === String(preset) ? 'default' : 'outline'}
                        onClick={() => setBuInput(String(preset))}
                      >
                        Ƀ {preset.toLocaleString('en-NG')}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-sm font-semibold">Amount you will pay (₦)</label>
                  <Input
                    type="number"
                    min={minPurchaseChargeNaira()}
                    step="1"
                    placeholder={`Minimum ₦${minPurchaseChargeNaira().toLocaleString('en-NG')}`}
                    value={nairaInput}
                    onChange={(e) => setNairaInput(e.target.value)}
                    className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {BU_BUY_PRESETS.map((preset) => {
                      const charge = Math.round(preset * buyRate)
                      return (
                        <Button
                          key={preset}
                          type="button"
                          size="sm"
                          variant={nairaInput === String(charge) ? 'default' : 'outline'}
                          onClick={() => setNairaInput(String(charge))}
                        >
                          ₦{charge.toLocaleString('en-NG')}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              )}
              {readyQuote && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">You pay by card</span>
                    <span className="text-xl font-bold text-primary">₦{formatNairaPlain(readyQuote.chargeNaira)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Wallet credit</span>
                    <span className="font-semibold">Ƀ {formatBu(readyQuote.bu)} (₦{formatNairaPlain(readyQuote.creditNaira)})</span>
                  </div>
                </div>
              )}
              {quoteError && <p className="text-sm text-destructive">{quoteError}</p>}
              <Button
                onClick={() => setStep('checkout')}
                disabled={!readyQuote}
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
              <span className="text-muted-foreground">You pay</span>
              <span className="font-semibold">₦{formatNairaPlain(readyQuote?.chargeNaira ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ɃU credited</span>
              <span className="font-bold text-primary">Ƀ {formatBu(readyQuote?.bu ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Wallet value</span>
              <span className="font-semibold">₦{formatNairaPlain(readyQuote?.creditNaira ?? 0)}</span>
            </div>
          </div>
        </Card>
        <p className="text-sm text-muted-foreground mb-4">
          Payment is completed on Paystack. Wallet credit is 1 ɃU = ₦1. The extra on the card is the 5% buy rate
          that covers Paystack collection and bank payouts.
        </p>
        {message && <p className="text-sm text-destructive mb-3">{message}</p>}
        <Button
          onClick={() => void handleCheckout()}
          disabled={busy || !readyQuote}
          className="w-full bg-primary py-6 text-primary-foreground hover:bg-primary/90"
        >
          {busy ? 'Opening Paystack…' : 'Pay with Paystack'}
        </Button>
      </div>
    </div>
  )
}
