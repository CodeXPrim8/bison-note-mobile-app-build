'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowUp, ArrowDown, Plus } from 'lucide-react'

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
  const [balance, setBalance] = useState(0)
  const [bisonUnits, setBisonUnits] = useState(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [email, setEmail] = useState('')
  const [showTopup, setShowTopup] = useState(false)
  const [topupAmount, setTopupAmount] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (json.data?.user?.email) setEmail(json.data.user.email)
      })
      .catch(() => undefined)
    fetch('/api/wallet', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) return
        const wallet = json.data?.wallet
        if (wallet) {
          setBisonUnits(Number(wallet.bu_balance ?? 0))
          setBalance(Number(wallet.naira_available ?? wallet.bu_balance ?? 0))
        }
        const txs = (json.data?.transactions ?? []) as Array<Record<string, unknown>>
        setTransactions(
          txs.map((tx) => ({
            id: String(tx.id),
            type: String(tx.type ?? tx.kind ?? 'transfer'),
            amount: Number(tx.amount ?? 0),
            date: String(tx.created_at ?? tx.date ?? ''),
            description: String(tx.description ?? tx.type ?? 'ɃU movement'),
          })),
        )
      })
      .catch(() => undefined)
  }, [])

  async function handleTopup() {
    const amount = Number(topupAmount)
    if (!amount || Number.isNaN(amount) || amount <= 0) return
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
        body: JSON.stringify({ email, amount }),
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

  return (
    <div className="space-y-6 pb-24 pt-4">
      <Card className="border-primary/20 bg-card p-6">
        <p className="text-sm text-muted-foreground">Total Balance</p>
        <h2 className="mt-2 text-4xl font-bold text-primary">
          ₦{balance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </h2>
        <p className="mt-4 text-sm">
          <span className="font-semibold">
            Ƀ {bisonUnits.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>{' '}
          Available
        </p>
      </Card>

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
              placeholder="Enter amount in Naira"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              className="bg-secondary text-foreground placeholder:text-muted-foreground"
            />
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
                  <p className="text-xs text-muted-foreground">{tx.date ? new Date(tx.date).toLocaleString() : ''}</p>
                </div>
              </div>
              <span className="font-semibold text-primary">₦{tx.amount.toLocaleString()}</span>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
