'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle } from 'lucide-react'
import { formatEventDateTime } from '@/lib/datetime'
import {
  BU_BUY_PRESETS,
  BU_MIN_WITHDRAW,
  BU_NAIRA_VALUE,
  formatBu,
  formatNairaPlain,
  quoteWithdrawBu,
  WalletAmountError,
} from '@/lib/bu-rate'
import { useAccount } from '@/components/account-store'
import { NGN_BANKS } from '@/lib/payments/ngn-banks'
import { WalletPageSummary } from '@/components/wallet-summary'
import { PinPadModal } from '@/components/pin-pad-modal'
import { BuInvoiceDialog } from '@/components/bu-invoice'
import { invoiceNumberFromId, type BuInvoice } from '@/lib/invoice/document'

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
  const { applySpendBu, refreshWallet, buBalance, userId, displayName } = useAccount()
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([])
  const [banks, setBanks] = useState<BankOption[]>(NGN_BANKS.map((bank) => ({ name: bank.name, code: bank.code })))
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [invoice, setInvoice] = useState<BuInvoice | null>(null)
  const [form, setForm] = useState({
    buAmount: '',
    bankCode: '999992',
    accountNumber: '',
    accountName: '',
    remark: '',
  })

  async function loadHistory() {
    if (!userId) {
      setWithdrawals([])
      return
    }
    const res = await fetch('/api/wallet/withdraw', { credentials: 'include' })
    const json = await res.json()
    if (!json.status) {
      setWithdrawals([])
      return
    }
    setWithdrawals((json.data?.withdrawals ?? []) as WithdrawalRequest[])
    if (Array.isArray(json.data?.banks) && json.data.banks.length) {
      const next = json.data.banks as BankOption[]
      setBanks(next)
      setForm((current) =>
        next.some((bank) => bank.code === current.bankCode)
          ? current
          : { ...current, bankCode: next.find((bank) => bank.code === '999992')?.code ?? next[0]?.code ?? '058' },
      )
    }
  }

  useEffect(() => {
    loadHistory().catch(() => setWithdrawals([]))
    void refreshWallet()
  }, [refreshWallet, userId])

  useEffect(() => {
    const digits = form.accountNumber.replace(/\D/g, '')
    if (digits.length !== 10 || !form.bankCode) {
      setForm((current) => (current.accountName ? { ...current, accountName: '' } : current))
      return
    }
    let cancelled = false
    setResolving(true)
    const timer = window.setTimeout(() => {
      fetch(
        `/api/wallet/withdraw?account_number=${encodeURIComponent(digits)}&bank_code=${encodeURIComponent(form.bankCode)}`,
        { credentials: 'include' },
      )
        .then(async (res) => {
          const json = await res.json()
          if (cancelled) return
          if (!json.status) {
            setForm((current) => ({ ...current, accountName: '' }))
            setMessage(json.message || 'Could not verify account number')
            return
          }
          setMessage(null)
          setForm((current) => ({
            ...current,
            accountName: String(json.data?.account_name || ''),
          }))
        })
        .catch(() => {
          if (!cancelled) setMessage('Could not verify account number')
        })
        .finally(() => {
          if (!cancelled) setResolving(false)
        })
    }, 450)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [form.accountNumber, form.bankCode])

  const quote = useMemo(() => {
    try {
      if (!form.buAmount) return null
      return quoteWithdrawBu(Number(form.buAmount))
    } catch (error) {
      if (error instanceof WalletAmountError) return { error: error.message }
      return { error: 'Enter a valid amount' }
    }
  }, [form.buAmount])

  const readyQuote = quote && !('error' in quote) ? quote : null
  const quoteError = quote && 'error' in quote ? quote.error : null
  const bank = banks.find((item) => item.code === form.bankCode)
  const canSend =
    Boolean(readyQuote) &&
    form.accountNumber.length === 10 &&
    Boolean(form.accountName) &&
    !resolving &&
    !busy

  function openPin() {
    if (!canSend) return
    setMessage(null)
    setPinError(null)
    setPinOpen(true)
  }

  async function handlePinSubmit(pin: string) {
    if (!readyQuote) return
    setBusy(true)
    setPinError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bu: readyQuote.bu,
          bank_name: bank?.name ?? 'Bank',
          bank_code: form.bankCode,
          account_number: form.accountNumber.replace(/\s+/g, ''),
          account_name: form.accountName.trim(),
          remark: form.remark.trim() || undefined,
          pin,
        }),
      })
      const json = await res.json()
      setBusy(false)
      if (!json.status) {
        if (json.code === 'WRONG_PIN') {
          setPinError(json.message || 'Incorrect transaction PIN.')
          return
        }
        setPinOpen(false)
        setMessage(json.message ?? 'Could not send to bank')
        return
      }
      setPinOpen(false)
      applySpendBu(readyQuote.bu)
      const row = json.data as WithdrawalRequest & {
        invoice_number?: string
        remark?: string | null
        bank_naira?: number
      }
      setInvoice({
        number: invoiceNumberFromId(String(row.invoice_number || row.id)),
        issuedAt: new Date().toISOString(),
        kind: 'bank',
        fromName: displayName || 'Ƀucks wallet',
        toName: `${row.account_name} · ${row.bank_name}`,
        toId: row.account_number,
        amountBu: Number(row.bu ?? readyQuote.bu),
        amountNaira: Number(row.bank_naira ?? row.naira ?? readyQuote.bankNaira),
        note: form.remark.trim() || undefined,
        status: row.label || 'Sent',
      })
      setForm({
        buAmount: '',
        bankCode: form.bankCode,
        accountNumber: '',
        accountName: '',
        remark: '',
      })
      await loadHistory()
      await refreshWallet()
    } catch {
      setBusy(false)
      setPinOpen(false)
      setMessage('Could not reach ɃU.')
    }
  }

  return (
    <div className="space-y-6 bg-transparent pb-28 pt-4 text-neutral-950">
      <div className="px-4">
        <WalletPageSummary
          kicker="To Bank"
          title="Send to bank"
          detail={`Send ɃU as naira to any Nigerian bank or wallet. 1 ɃU = ₦${BU_NAIRA_VALUE.toLocaleString('en-NG')}.`}
        />

        <Card className="mt-6 border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-5">
          <p className="text-xs text-muted-foreground">Wallet</p>
          <p className="mt-1 text-2xl font-bold text-primary">
            {buBalance == null ? '…' : `Ƀ ${formatBu(buBalance)}`}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Minimum {BU_MIN_WITHDRAW.toLocaleString('en-NG')} ɃU. Transfer fees are covered by Ƀucks.
          </p>
        </Card>

        <Card className="mt-4 space-y-4 border-primary/20 bg-card p-5">
          <div>
            <label className="text-sm font-semibold">Amount (ɃU)</label>
            <Input
              type="number"
              min={BU_MIN_WITHDRAW}
              step="1"
              placeholder={`Minimum ${BU_MIN_WITHDRAW.toLocaleString('en-NG')}`}
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
            {readyQuote ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Receiver gets ₦{formatNairaPlain(readyQuote.bankNaira)}
              </p>
            ) : quoteError ? (
              <p className="mt-2 text-xs text-destructive">{quoteError}</p>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-semibold">Receiver bank</label>
            <select
              value={form.bankCode}
              onChange={(e) => setForm({ ...form, bankCode: e.target.value, accountName: '' })}
              className="mt-2 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-foreground"
            >
              {banks.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold">Receiver account number</label>
            <Input
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit NUBAN"
              value={form.accountNumber}
              onChange={(e) =>
                setForm({
                  ...form,
                  accountNumber: e.target.value.replace(/\D/g, '').slice(0, 10),
                  accountName: '',
                })
              }
              className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
            />
            <p className="mt-2 text-sm font-medium text-primary">
              {resolving
                ? 'Looking up account name…'
                : form.accountName
                  ? form.accountName
                  : form.accountNumber.length === 10
                    ? 'Account name not found'
                    : 'Account name appears after you enter the number'}
            </p>
          </div>

          <div>
            <label className="text-sm font-semibold">Remarks</label>
            <Input
              maxLength={160}
              placeholder="Optional note"
              value={form.remark}
              onChange={(e) => setForm({ ...form, remark: e.target.value })}
              className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {message && <p className="text-sm text-destructive">{message}</p>}

          <Button
            type="button"
            onClick={openPin}
            disabled={!canSend}
            className="w-full bg-primary py-6 text-primary-foreground hover:bg-primary/90"
          >
            Send
          </Button>
        </Card>

        <div className="mt-8">
          <h3 className="mb-4 font-semibold">Recent sends</h3>
          <div className="space-y-3">
            {withdrawals.length === 0 ? (
              <Card className="border-border/50 bg-card/50 p-8 text-center">
                <p className="text-muted-foreground">No bank sends yet</p>
              </Card>
            ) : (
              withdrawals.map((withdrawal) => (
                <Card key={withdrawal.id} className="border-border/50 bg-card/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{withdrawal.bank_name}</h3>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                          {withdrawal.label}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {withdrawal.account_number} · {withdrawal.account_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {withdrawal.created_at ? formatEventDateTime(withdrawal.created_at) : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      {withdrawal.public_status === 'completed' && (
                        <CheckCircle className="mb-1 ml-auto h-4 w-4 text-green-500" />
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

      <PinPadModal
        open={pinOpen}
        title="Enter transaction PIN"
        busy={busy}
        error={pinError}
        onClose={() => {
          if (!busy) setPinOpen(false)
        }}
        onSubmit={handlePinSubmit}
      />

      <BuInvoiceDialog
        invoice={invoice}
        open={Boolean(invoice)}
        onOpenChange={(open) => {
          if (!open) setInvoice(null)
        }}
      />
    </div>
  )
}
