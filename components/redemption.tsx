'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Banknote, CheckCircle, AlertCircle } from 'lucide-react'
import { formatEventDateTime } from '@/lib/datetime'
import { BU_BUY_PRESETS, BU_MIN_WITHDRAW, BU_NAIRA_VALUE, formatBu, formatNairaPlain, quoteWithdrawBu, WalletAmountError } from '@/lib/bu-rate'
import { useAccount } from '@/components/account-store'

interface WithdrawalRequest {
  id: string
  buAmount: number
  nairaAmount: number
  bankName: string
  accountNumber: string
  accountName: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  date: string
  completedDate?: string
}

export default function Redemption() {
  const { applySpendBu } = useAccount()
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([])
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    buAmount: '',
    bankName: 'GTBank',
    accountNumber: '',
    accountName: '',
  })

  async function handleWithdraw() {
    if (
      !form.buAmount ||
      isNaN(Number(form.buAmount)) ||
      Number(form.buAmount) <= 0 ||
      !form.accountNumber ||
      !form.accountName
    ) {
      return
    }
    let quote
    try {
      quote = quoteWithdrawBu(Number(form.buAmount))
    } catch (error) {
      setMessage(error instanceof WalletAmountError ? error.message : 'Enter how many ɃU to withdraw')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bu: Number(form.buAmount),
          bank_name: form.bankName,
          account_number: form.accountNumber,
          account_name: form.accountName,
        }),
      })
      const json = await res.json()
      setBusy(false)
      if (!json.status) {
        setMessage(json.message ?? 'Withdrawal failed')
        return
      }
      const buAmount = quote.bu
      applySpendBu(buAmount)
      setWithdrawals([
        {
          id: String(Date.now()),
          buAmount,
          nairaAmount: quote.bankNaira,
          bankName: form.bankName,
          accountNumber: `****${form.accountNumber.slice(-4)}`,
          accountName: form.accountName,
          status: 'pending',
          date: formatEventDateTime(new Date()),
        },
        ...withdrawals,
      ])
      setForm({ buAmount: '', bankName: 'GTBank', accountNumber: '', accountName: '' })
      setShowForm(false)
    } catch {
      setBusy(false)
      setMessage('Could not reach ɃU.')
    }
  }

  let withdrawQuote: ReturnType<typeof quoteWithdrawBu> | null = null
  let withdrawQuoteError: string | null = null
  try {
    withdrawQuote = quoteWithdrawBu(Number(form.buAmount))
  } catch (error) {
    if (form.buAmount) {
      withdrawQuoteError = error instanceof WalletAmountError ? error.message : null
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400'
      case 'processing':
        return 'text-yellow-400'
      default:
        return 'text-gray-400'
    }
  }

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-400/10'
      case 'processing':
        return 'bg-yellow-400/10'
      default:
        return 'bg-gray-400/10'
    }
  }

  return (
    <div className="space-y-6 pb-24 pt-4">
      {/* Info Card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold">Withdraw ɃU to Bank</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Withdraw your ɃU directly to your bank account. Physical Bison Notes are ceremonial tokens and cannot be redeemed.
            </p>
          </div>
          <Banknote className="h-6 w-6 text-primary" />
        </div>
        <div className="mt-4 rounded-lg bg-background/50 p-3">
          <p className="text-xs text-muted-foreground">Conversion Rate</p>
          <p className="mt-1 text-lg font-bold text-primary">1 ɃU = ₦{BU_NAIRA_VALUE.toLocaleString('en-NG')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Minimum {BU_MIN_WITHDRAW.toLocaleString('en-NG')} ɃU. You receive the full naira amount. Paystack bank
            transfer fees (₦10–₦50 plus ₦50 stamp duty from ₦10,000) are covered by the 5% card buy rate.
          </p>
        </div>
        <div className="mt-4 rounded-lg border border-yellow-400/30 bg-yellow-400/10 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-400">
              Note: Physical Bison Notes are ceremonial tokens with zero monetary value. Only ɃU in your wallet can be withdrawn.
            </p>
          </div>
        </div>
      </Card>

      {/* Withdraw Button */}
      <Button
        onClick={() => setShowForm(true)}
        className="w-full bg-primary py-6 text-primary-foreground hover:bg-primary/90"
      >
        Withdraw ɃU
      </Button>

      {/* Withdrawal Form */}
      {showForm && (
        <Card className="border-primary/20 space-y-4 bg-card p-6">
          <h3 className="font-semibold">Withdraw Bison Units</h3>

          <div>
            <label className="text-sm font-semibold">Amount to Withdraw (ɃU)</label>
            <Input
              type="number"
              min={BU_MIN_WITHDRAW}
              step="1"
              placeholder={`Minimum ${BU_MIN_WITHDRAW.toLocaleString('en-NG')} ɃU`}
              value={form.buAmount}
              onChange={(e) => setForm({ ...form, buAmount: e.target.value })}
              className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {BU_BUY_PRESETS.filter((preset) => preset >= BU_MIN_WITHDRAW).map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={form.buAmount === String(preset) ? 'default' : 'outline'}
                  onClick={() => setForm({ ...form, buAmount: String(preset) })}
                >
                  Ƀ {preset.toLocaleString('en-NG')}
                </Button>
              ))}
            </div>
            {withdrawQuote ? (
              <p className="mt-1 text-xs text-muted-foreground">
                You receive ₦{formatNairaPlain(withdrawQuote.bankNaira)} in your bank. Paystack payout on this amount is ₦
                {withdrawQuote.paystackFee.toLocaleString('en-NG')} and is covered by ɃU.
              </p>
            ) : withdrawQuoteError ? (
              <p className="mt-1 text-xs text-destructive">{withdrawQuoteError}</p>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-semibold">Full Name</label>
            <Input
              placeholder="Enter your full name"
              value={form.accountName}
              onChange={(e) => setForm({ ...form, accountName: e.target.value })}
              className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div>
            <label className="text-sm font-semibold">Bank Name</label>
            <select
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
              className="mt-2 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-foreground"
            >
              <option>GTBank</option>
              <option>Access Bank</option>
              <option>Zenith Bank</option>
              <option>First Bank</option>
              <option>UBA</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold">Account Number</label>
            <Input
              type="number"
              placeholder="Enter account number"
              value={form.accountNumber}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
              className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <p className="text-xs text-destructive">
              Please verify your bank details carefully. Incorrect details may result in
              failed transactions.
            </p>
          </div>

          {message && <p className="text-sm text-destructive">{message}</p>}
          <div className="flex gap-2">
            <Button
              onClick={() => void handleWithdraw()}
              disabled={busy || !withdrawQuote || !form.accountNumber || !form.accountName}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {busy ? 'Submitting…' : 'Confirm Withdrawal'}
            </Button>
            <Button
              onClick={() => setShowForm(false)}
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Withdrawal History */}
      <div>
        <h3 className="mb-4 font-semibold">Withdrawal History</h3>
        <div className="space-y-3">
          {withdrawals.length === 0 ? (
            <Card className="border-border/50 bg-card/50 p-8 text-center">
              <p className="text-muted-foreground">No withdrawals yet</p>
            </Card>
          ) : (
            withdrawals.map((withdrawal) => (
            <Card
                key={withdrawal.id}
                className={`border-border/50 ${getStatusBg(withdrawal.status)} bg-card/50 p-4`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{withdrawal.bankName}</h3>
                    <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${getStatusColor(withdrawal.status)}`}
                    >
                        {withdrawal.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                      {withdrawal.accountNumber} · {withdrawal.accountName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                      {withdrawal.date}
                      {withdrawal.completedDate && ` · Completed ${withdrawal.completedDate}`}
                  </p>
                </div>
                <div className="text-right">
                    {withdrawal.status === 'completed' && (
                    <CheckCircle className="mb-2 h-5 w-5 text-green-400" />
                  )}
                  <p className="font-bold">₦{formatNairaPlain(withdrawal.nairaAmount)}</p>
                  <p className="text-xs text-muted-foreground">Ƀ {formatBu(withdrawal.buAmount)}</p>
                </div>
              </div>
            </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
