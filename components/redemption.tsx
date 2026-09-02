'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Banknote, CheckCircle, AlertCircle } from 'lucide-react'
import { formatEventDateTime } from '@/lib/datetime'
import { BU_BUY_PRESETS, BU_MIN_WITHDRAW, BU_NAIRA_VALUE, formatBu, formatNairaPlain, quoteWithdrawBu, WalletAmountError } from '@/lib/bu-rate'
import { useAccount } from '@/components/account-store'
import { NGN_BANKS } from '@/lib/payments/ngn-banks'

interface WithdrawalRequest {
  id: string
  bu: number
  naira: number
  bank_name: string
  account_number: string
  account_name: string
  public_status: string
  label: string
  created_at: string
  paid_at: string | null
}

type BankOption = { name: string; code: string }

export default function Redemption() {
  const { applySpendBu, refreshWallet, buBalance } = useAccount()
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([])
  const [banks, setBanks] = useState<BankOption[]>(NGN_BANKS.map((bank) => ({ name: bank.name, code: bank.code })))
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [okMessage, setOkMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    buAmount: '',
    bankCode: '058',
    accountNumber: '',
    accountName: '',
  })

  async function loadHistory() {
    const res = await fetch('/api/wallet/withdraw', { credentials: 'include' })
    const json = await res.json()
    if (!json.status) return
    setWithdrawals((json.data?.withdrawals ?? []) as WithdrawalRequest[])
    if (Array.isArray(json.data?.banks) && json.data.banks.length) {
      setBanks(json.data.banks as BankOption[])
    }
  }

  useEffect(() => {
    loadHistory().catch(() => undefined)
    void refreshWallet()
  }, [refreshWallet])

  async function handleWithdraw() {
    if (!form.buAmount || !form.accountNumber || !form.accountName) return
    let quote
    try {
      quote = quoteWithdrawBu(Number(form.buAmount))
    } catch (error) {
      setMessage(error instanceof WalletAmountError ? error.message : 'Enter how many ɃU to withdraw')
      return
    }
    const bank = banks.find((item) => item.code === form.bankCode)
    setBusy(true)
    setMessage(null)
    setOkMessage(null)
    try {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bu: Number(form.buAmount),
          bank_name: bank?.name ?? 'Bank',
          bank_code: form.bankCode,
          account_number: form.accountNumber.replace(/\s+/g, ''),
          account_name: form.accountName.trim(),
        }),
      })
      const json = await res.json()
      setBusy(false)
      if (!json.status) {
        setMessage(json.message ?? 'Withdrawal failed')
        return
      }
      applySpendBu(quote.bu)
      setOkMessage(json.message ?? 'Withdrawal sent')
      setForm({ buAmount: '', bankCode: form.bankCode, accountNumber: '', accountName: form.accountName })
      setShowForm(false)
      await loadHistory()
      await refreshWallet()
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
      case 'pending':
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
      case 'pending':
        return 'bg-yellow-400/10'
      default:
        return 'bg-gray-400/10'
    }
  }

  return (
    <div className="space-y-6 pb-24 pt-4">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold">Withdraw ɃU to Bank</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Withdraw your ɃU directly to your Nigerian bank account. Physical Bison Notes are ceremonial tokens and cannot be redeemed.
            </p>
          </div>
          <Banknote className="h-6 w-6 text-primary" />
        </div>
        <div className="mt-4 rounded-lg bg-background/50 p-3">
          <p className="text-xs text-muted-foreground">Wallet</p>
          <p className="mt-1 text-lg font-bold text-primary">
            {buBalance == null ? '…' : `Ƀ ${formatBu(buBalance)}`}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Conversion Rate</p>
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

      {okMessage && <p className="text-sm text-green-400">{okMessage}</p>}

      <Button
        onClick={() => setShowForm(true)}
        className="w-full bg-primary py-6 text-primary-foreground hover:bg-primary/90"
      >
        Withdraw ɃU
      </Button>

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
            <label className="text-sm font-semibold">Account name</label>
            <Input
              placeholder="Name on the bank account"
              value={form.accountName}
              onChange={(e) => setForm({ ...form, accountName: e.target.value })}
              className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div>
            <label className="text-sm font-semibold">Bank</label>
            <select
              value={form.bankCode}
              onChange={(e) => setForm({ ...form, bankCode: e.target.value })}
              className="mt-2 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-foreground"
            >
              {banks.map((bank) => (
                <option key={bank.code} value={bank.code}>
                  {bank.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold">Account number</label>
            <Input
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit NUBAN"
              value={form.accountNumber}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
              className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <p className="text-xs text-destructive">
              Check the account name and number. A wrong NUBAN can send the payout to someone else or fail.
            </p>
          </div>

          {message && <p className="text-sm text-destructive">{message}</p>}
          <div className="flex gap-2">
            <Button
              onClick={() => void handleWithdraw()}
              disabled={busy || !withdrawQuote || form.accountNumber.length !== 10 || !form.accountName}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {busy ? 'Sending to bank…' : 'Confirm Withdrawal'}
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
                className={`border-border/50 ${getStatusBg(withdrawal.public_status)} bg-card/50 p-4`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{withdrawal.bank_name}</h3>
                    <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${getStatusColor(withdrawal.public_status)}`}
                    >
                        {withdrawal.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                      {withdrawal.account_number} · {withdrawal.account_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                      {withdrawal.created_at ? formatEventDateTime(withdrawal.created_at) : ''}
                      {withdrawal.paid_at ? ` · Paid ${formatEventDateTime(withdrawal.paid_at)}` : ''}
                  </p>
                </div>
                <div className="text-right">
                    {withdrawal.public_status === 'completed' && (
                    <CheckCircle className="mb-2 h-5 w-5 text-green-400" />
                  )}
                  <p className="font-bold">₦{formatNairaPlain(withdrawal.naira)}</p>
                  <p className="text-xs text-muted-foreground">Ƀ {formatBu(withdrawal.bu)}</p>
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
