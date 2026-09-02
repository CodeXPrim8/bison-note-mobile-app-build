'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowUp, ArrowDown, Plus } from 'lucide-react'
import { formatEventDateTime } from '@/lib/datetime'
import { useAccount } from '@/components/account-store'
import { AdSlot } from '@/components/web/ad-slot'
import {
  BU_BUY_PRESETS,
  BU_MIN_PURCHASE,
  BU_NAIRA_VALUE,
  BuyQuoteError,
  cardBuyRate,
  buFromNaira,
  formatBu,
  formatNairaPlain,
  formatNairaRate,
  minPurchaseChargeNaira,
  quoteBuyBu,
} from '@/lib/bu-rate'

interface Transaction {
  id: string
  type: string
  amount: number
  date: string
  description: string
}

interface WalletProps {
  onNavigate?: (page: string) => void
}

export default function Wallet({ onNavigate }: WalletProps = {}) {
  const { buBalance, nairaBalance, applyWallet } = useAccount()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [email, setEmail] = useState('')
  const [showTopup, setShowTopup] = useState(false)
  const [topupBu, setTopupBu] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (json.data?.user) {
          setEmail(json.data.profile?.email || json.data.user.email || '')
        }
      })
      .catch(() => undefined)
    fetch('/api/wallet', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) return
        if (json.data?.wallet) applyWallet(json.data.wallet)
        const txs = (json.data?.transactions ?? []) as Array<Record<string, unknown>>
        setTransactions(
          txs
            .map((tx) => ({
              id: String(tx.id),
              type: String(tx.type ?? tx.kind ?? 'transfer'),
              amount: Number(tx.amount ?? 0),
              date: String(tx.created_at ?? tx.date ?? ''),
              description: String(tx.description ?? tx.type ?? 'ɃU movement'),
            }))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        )
      })
      .catch(() => undefined)
  }, [])

  async function handleTopup() {
    const bu = Number(topupBu)
    let quote
    try {
      quote = quoteBuyBu(bu)
    } catch (error) {
      setMessage(error instanceof BuyQuoteError ? error.message : 'Enter how many ɃU to buy')
      return
    }
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
        body: JSON.stringify({ email, bu: quote.bu }),
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

  let topupQuote: ReturnType<typeof quoteBuyBu> | null = null
  try {
    topupQuote = quoteBuyBu(Number(topupBu))
  } catch {
    topupQuote = null
  }

  return (
    <div className="space-y-6 pb-24 pt-4">
      <Card className="border-primary/20 bg-card p-6">
        <p className="text-sm text-muted-foreground">Total Balance</p>
        <h2 className="mt-2 text-4xl font-bold text-primary">
          {nairaBalance == null ? '\u00a0' : `₦${formatNairaPlain(nairaBalance)}`}
        </h2>
        <p className="mt-4 text-sm">
          <span className="font-semibold">{buBalance == null ? '\u00a0' : `Ƀ ${formatBu(buBalance)}`}</span>
          {buBalance != null ? ' Available' : ''}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          1 ɃU = ₦{BU_NAIRA_VALUE.toLocaleString('en-NG')} to spray or withdraw. Card buy ₦{formatNairaRate(cardBuyRate())}.
        </p>
      </Card>

      <AdSlot slot="app_wallet" />

      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={() => setShowTopup(true)}
          className="h-20 flex-col gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-5 w-5" />
          <span>Fund Wallet</span>
        </Button>
        <Button
          onClick={() => onNavigate?.('receive-bu')}
          className="h-20 flex-col gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <ArrowDown className="h-5 w-5" />
          <span>Receive ɃU</span>
        </Button>
      </div>

      {showTopup && (
        <Card className="border-primary/20 bg-card p-4">
          <h3 className="mb-4 font-semibold">Fund Your Wallet</h3>
          <div className="space-y-3">
            <Input
              type="number"
              min={BU_MIN_PURCHASE}
              step="1"
              placeholder={`ɃU to buy (min ${BU_MIN_PURCHASE.toLocaleString('en-NG')})`}
              value={topupBu}
              onChange={(e) => setTopupBu(e.target.value)}
              className="bg-secondary text-foreground placeholder:text-muted-foreground"
            />
            <div className="flex flex-wrap gap-2">
              {BU_BUY_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={topupBu === String(preset) ? 'default' : 'outline'}
                  onClick={() => setTopupBu(String(preset))}
                >
                  Ƀ {preset.toLocaleString('en-NG')}
                </Button>
              ))}
            </div>
            {topupQuote ? (
              <p className="text-xs text-muted-foreground">
                You pay ₦{formatNairaPlain(topupQuote.chargeNaira)} by card · wallet gets Ƀ {formatBu(topupQuote.bu)} (₦
                {formatNairaPlain(topupQuote.creditNaira)}). Card ₦{formatNairaRate(cardBuyRate())} / ɃU.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Card ₦{formatNairaRate(cardBuyRate())} / ɃU · withdraw ₦{BU_NAIRA_VALUE.toLocaleString('en-NG')} / ɃU ·
                min {BU_MIN_PURCHASE.toLocaleString('en-NG')} ɃU (₦{formatNairaPlain(minPurchaseChargeNaira())})
              </p>
            )}
            {message && <p className="text-sm text-destructive">{message}</p>}
            <div className="flex gap-2">
              <Button
                onClick={() => void handleTopup()}
                disabled={busy}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {busy ? 'Opening Paystack…' : 'Top Up'}
              </Button>
              <Button onClick={() => setShowTopup(false)} variant="outline" className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div>
        <h3 className="mb-4 font-semibold">Transaction History</h3>
        <div className="space-y-3">
          {transactions.length === 0 && (
            <p className="text-sm text-muted-foreground">No wallet movements yet.</p>
          )}
          {transactions.map((tx) => (
            <Card key={tx.id} className="border-border/50 flex items-center justify-between bg-card/50 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/20 p-2">
                  {tx.type === 'withdrawal' ? (
                    <ArrowUp className="h-4 w-4 text-destructive" />
                  ) : (
                    <ArrowDown className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div>
                  <p className="font-medium">{tx.description}</p>
                  <p className="text-xs text-muted-foreground">{tx.date ? formatEventDateTime(tx.date) : ''}</p>
                </div>
              </div>
              <span className="font-semibold text-primary">
                Ƀ {formatBu(buFromNaira(tx.amount))}
                <span className="block text-xs font-normal text-muted-foreground">₦{formatNairaPlain(tx.amount)}</span>
              </span>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
