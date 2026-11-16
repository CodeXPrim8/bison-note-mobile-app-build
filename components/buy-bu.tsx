'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowRight, Check, Copy, Share2 } from 'lucide-react'
import { WalletPageSummary } from '@/components/wallet-summary'
import { useAccount } from '@/components/account-store'
import { BuLoader } from '@/components/bu-loader'
import {
  BU_BUY_PRESETS,
  BU_MIN_PURCHASE,
  BU_NAIRA_VALUE,
  BuyQuoteError,
  cardBuyRate,
  formatBu,
  formatNairaPlain,
  minPurchaseChargeNaira,
  quoteBuyBu,
  quoteBuyFromChargeNaira,
} from '@/lib/bu-rate'

interface BuyBUProps {
  onComplete?: (amount: number) => void
}

type FundMode = 'bank' | 'card'
type CardStep = 'conversion' | 'checkout'

type VirtualAccount = {
  bank_name: string | null
  bank_slug: string | null
  account_number: string
  account_name: string | null
  currency: string
  active: boolean
  needs_brand_refresh?: boolean
}

function formatNuban(accountNumber: string) {
  const digits = accountNumber.replace(/\D/g, '')
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return digits || accountNumber
}

export default function BuyBU({ onComplete: _onComplete }: BuyBUProps) {
  const { refreshWallet } = useAccount()
  const [fundMode, setFundMode] = useState<FundMode>('bank')
  const [step, setStep] = useState<CardStep>('conversion')
  const [mode, setMode] = useState<'bu' | 'naira'>('bu')
  const [buInput, setBuInput] = useState('')
  const [nairaInput, setNairaInput] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccount | null>(null)
  const [vaLoading, setVaLoading] = useState(true)
  const [vaError, setVaError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const syncingRef = useRef(false)
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

  useEffect(() => {
    let cancelled = false
    setVaLoading(true)
    setVaError(null)
    fetch('/api/wallet/virtual-account', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (cancelled) return
        if (!json.status) {
          setVirtualAccount(null)
          setVaError(json.message || 'Could not load bank account details')
          return
        }
        setVirtualAccount(json.data as VirtualAccount)
        setVaError(null)
      })
      .catch(() => {
        if (!cancelled) {
          setVirtualAccount(null)
          setVaError('Could not reach ɃU for bank transfer details')
        }
      })
      .finally(() => {
        if (!cancelled) setVaLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (fundMode !== 'bank' || !virtualAccount?.account_number) return
    let cancelled = false
    let ticks = 0

    async function syncOnce(forceRequery = false) {
      if (cancelled || syncingRef.current) return
      syncingRef.current = true
      ticks += 1
      try {
        const res = await fetch('/api/wallet/virtual-account/sync', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requery: forceRequery || ticks === 1 || ticks % 8 === 0 }),
        })
        const json = await res.json()
        if (cancelled || !json.status) return
        const credited = (json.data?.credited ?? []) as Array<{ reference: string; amount: number }>
        if (credited.length) {
          const total = credited.reduce((sum, row) => sum + Number(row.amount || 0), 0)
          setSyncNote(`+₦${total.toLocaleString('en-NG')} credited to your wallet`)
          await refreshWallet()
          // Account store pulse already fires once when the balance changes — don't double-dispatch.
        }
      } catch {
        // Keep polling; bank apps can confirm a few seconds before we credit.
      } finally {
        syncingRef.current = false
      }
    }

    void syncOnce(true)
    const timer = window.setInterval(() => void syncOnce(false), 800)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [fundMode, virtualAccount?.account_number, refreshWallet])

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

  const shareText = useMemo(() => {
    if (!virtualAccount?.account_number) return ''
    const bank = virtualAccount.bank_name || 'Bank'
    const name = virtualAccount.account_name || 'Ƀucks'
    return `Transfer to Ƀucks\nBank: ${bank}\nAccount name: ${name}\nAccount number: ${virtualAccount.account_number}\n1 ɃU = ₦1`
  }, [virtualAccount])

  async function handleCopyAccount() {
    if (!virtualAccount?.account_number) return
    try {
      await navigator.clipboard.writeText(virtualAccount.account_number)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setVaError('Could not copy account number')
    }
  }

  async function handleShareAccount() {
    if (!shareText) return
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Ƀucks bank details', text: shareText })
        return
      }
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* user cancelled share */
    }
  }

  async function handleCheckout() {
    if (!readyQuote) return
    if (!email) {
      setMessage('This account has no email yet. Add your own email in Settings.')
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
        setMessage(json.message ?? 'Could not start checkout')
        return
      }
      window.location.assign(json.data.authorization_url)
    } catch {
      setBusy(false)
      setMessage('Could not reach ɃU.')
    }
  }

  if (fundMode === 'bank') {
    return (
      <div className="space-y-6 bg-transparent pb-28 pt-4 text-neutral-950">
        <div className="px-4">
          <WalletPageSummary
            kicker="Fund"
            title="Bank transfer"
            detail="Send Naira from any Nigerian bank. 1 ɃU = ₦1 lands in your wallet automatically."
          />
          <h2 className="sr-only">Fund with bank transfer</h2>

          <div className="mb-4 mt-6 flex gap-2">
            <Button type="button" className="flex-1" variant="default">
              Bank transfer
            </Button>
            <Button
              type="button"
              className="flex-1"
              variant="outline"
              onClick={() => {
                setFundMode('card')
                setStep('conversion')
              }}
            >
              Card
            </Button>
          </div>

          <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-6">
            {vaLoading ? (
              <div className="py-6">
                <div className="flex justify-center">
                  <BuLoader compact />
                </div>
                <p className="mt-3 text-center text-sm text-muted-foreground">Loading your Ƀucks account number…</p>
              </div>
            ) : virtualAccount ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bank</p>
                  <p className="mt-1 text-lg font-semibold">{virtualAccount.bank_name || 'Bank'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account name</p>
                  <p className="mt-1 text-base font-medium">{virtualAccount.account_name || 'Ƀucks'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account number</p>
                  <p className="mt-1 font-mono text-3xl font-bold tracking-wide text-primary">
                    {formatNuban(virtualAccount.account_number)}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Transfer any amount. Stay on this screen — we credit your ɃU as soon as the transfer lands.
                </p>
                {syncNote && <p className="text-sm font-semibold text-primary">{syncNote}</p>}
                <div className="flex gap-2">
                  <Button type="button" className="flex-1" onClick={() => void handleCopyAccount()}>
                    {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                    {copied ? 'Copied' : 'Copy number'}
                  </Button>
                  <Button type="button" variant="outline" className="flex-1" onClick={() => void handleShareAccount()}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-destructive">{vaError || 'Bank account details unavailable'}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setFundMode('card')
                    setStep('conversion')
                  }}
                >
                  Fund with card instead
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    )
  }

  if (step === 'conversion') {
    return (
      <div className="space-y-6 bg-transparent pb-28 pt-4 text-neutral-950">
        <div className="px-4">
          <WalletPageSummary
            kicker="Fund"
            title="Buy ɃU"
            detail={`Card rate ₦${buyRate.toLocaleString('en-NG')} per ɃU. Wallet value stays ₦${BU_NAIRA_VALUE.toLocaleString('en-NG')}.`}
          />
          <h2 className="sr-only">Buy ɃU</h2>

          <div className="mb-4 mt-6 flex gap-2">
            <Button type="button" className="flex-1" variant="outline" onClick={() => setFundMode('bank')}>
              Bank transfer
            </Button>
            <Button type="button" className="flex-1" variant="default">
              Card
            </Button>
          </div>

          <Card className="mb-4 border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-6">
            <div className="space-y-2">
              <h3 className="font-semibold">Rates</h3>
              <p className="text-2xl font-bold text-primary">1 ɃU = ₦{BU_NAIRA_VALUE.toLocaleString('en-NG')} to spray or withdraw</p>
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
                <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
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
    <div className="space-y-6 bg-transparent pb-28 pt-4 text-neutral-950">
      <div className="px-4">
        <WalletPageSummary kicker="Fund" title="Checkout" detail="Checkout uses the email saved on this account." />
        <div className="mb-4 mt-6">
          <Button onClick={() => setStep('conversion')} variant="outline" className="w-full">
            ← Back
          </Button>
        </div>
        <Card className="mb-4 border-primary/20 bg-card p-6">
          <h3 className="mb-4 font-semibold">Order Summary</h3>
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
        <p className="mb-3 text-sm text-muted-foreground">
          {email ? `Receipt email: ${email}` : 'No email on this account yet. Add one in Settings before funding.'}
        </p>
        {message && <p className="mb-3 text-sm text-destructive">{message}</p>}
        <Button
          onClick={() => void handleCheckout()}
          disabled={busy || !readyQuote}
          className="w-full bg-primary py-6 text-primary-foreground hover:bg-primary/90"
        >
          {busy ? 'Opening checkout…' : 'Pay now'}
        </Button>
      </div>
    </div>
  )
}
