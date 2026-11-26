'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle, ChevronDown, Search, Star, Trash2 } from 'lucide-react'
import { BankLogo } from '@/components/bank-logo'
import { BalanceSparkline, useBalanceSpark } from '@/components/balance-sparkline'
import { formatEventDateTime } from '@/lib/datetime'
import {
  BU_BUY_PRESETS,
  BU_MIN_WITHDRAW,
  BU_NAIRA_VALUE,
  formatBu,
  formatNairaPlain,
  quoteWithdrawBu,
  WalletAmountError,
  type FeeProvider,
} from '@/lib/bu-rate'
import { useAccount } from '@/components/account-store'
import { bankCodeFromName, NGN_BANKS } from '@/lib/payments/ngn-banks'
import { PinPadModal } from '@/components/pin-pad-modal'
import { BuInvoiceDialog } from '@/components/bu-invoice'
import { invoiceNumberFromId, type BuInvoice } from '@/lib/invoice/document'
import { ScanAccountButton } from '@/components/scan-account-button'
import { parsePayQr } from '@/lib/pay-qr'

interface WithdrawalRequest {
  id: string
  bu: number
  naira: number
  bank_name: string
  bank_code?: string
  account_number: string
  account_name: string
  public_status: string
  label: string
  created_at: string
  paid_at: string | null
}

type BankOption = { name: string; code: string }

type BankReceiver = {
  bankCode: string
  bankName: string
  accountNumber: string
  accountName: string
}

const BENEFICIARIES_KEY = 'bu_bank_beneficiaries'

function receiverKey(row: Pick<BankReceiver, 'bankCode' | 'accountNumber'>) {
  return `${row.bankCode}|${row.accountNumber}`
}

function readBeneficiaries(userId: string | null | undefined): BankReceiver[] {
  if (typeof window === 'undefined' || !userId) return []
  try {
    const raw = window.localStorage.getItem(`${BENEFICIARIES_KEY}:${userId}`)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const item = row as Record<string, unknown>
        const accountNumber = String(item.accountNumber ?? '').replace(/\D/g, '')
        const bankCode = String(item.bankCode ?? '').trim()
        const bankName = String(item.bankName ?? '').trim()
        const accountName = String(item.accountName ?? '').trim()
        if (accountNumber.length !== 10 || !bankCode) return null
        return {
          bankCode,
          bankName: bankName || 'Bank',
          accountNumber,
          accountName: accountName || accountNumber,
        }
      })
      .filter((row): row is BankReceiver => Boolean(row))
  } catch {
    return []
  }
}

function writeBeneficiaries(userId: string, rows: BankReceiver[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(`${BENEFICIARIES_KEY}:${userId}`, JSON.stringify(rows.slice(0, 40)))
}

function maskNuban(account: string) {
  const digits = account.replace(/\D/g, '')
  if (digits.length < 4) return digits
  return `•••• ${digits.slice(-4)}`
}

function withdrawalToReceiver(row: WithdrawalRequest): BankReceiver | null {
  const accountNumber = String(row.account_number || '').replace(/\D/g, '')
  if (accountNumber.length !== 10) return null
  const bankName = String(row.bank_name || 'Bank')
  const bankCode = String(row.bank_code || bankCodeFromName(bankName) || '').trim()
  if (!bankCode) return null
  return {
    bankCode,
    bankName,
    accountNumber,
    accountName: String(row.account_name || accountNumber),
  }
}

function uniqueReceivers(rows: WithdrawalRequest[]): BankReceiver[] {
  const seen = new Set<string>()
  const out: BankReceiver[] = []
  for (const row of rows) {
    const receiver = withdrawalToReceiver(row)
    if (!receiver) continue
    const key = receiverKey(receiver)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(receiver)
  }
  return out
}

export default function Redemption() {
  const { applySpendBu, refreshWallet, buBalance, userId, displayName } = useAccount()
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([])
  const [banks, setBanks] = useState<BankOption[]>(NGN_BANKS.map((bank) => ({ name: bank.name, code: bank.code })))
  const [beneficiaries, setBeneficiaries] = useState<BankReceiver[]>([])
  const spark = useBalanceSpark(userId, buBalance)
  const [receiverSearch, setReceiverSearch] = useState('')
  const [bankQuery, setBankQuery] = useState('')
  const [bankMenuOpen, setBankMenuOpen] = useState(false)
  const bankPickerRef = useRef<HTMLDivElement | null>(null)
  const [saveBeneficiary, setSaveBeneficiary] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [invoice, setInvoice] = useState<BuInvoice | null>(null)
  const [freeUsedToday, setFreeUsedToday] = useState(0)
  const [payoutProvider, setPayoutProvider] = useState<FeeProvider>('paystack')
  const [form, setForm] = useState({
    buAmount: '',
    bankCode: '',
    accountNumber: '',
    accountName: '',
    remark: '',
  })

  async function fillBankFromScan(raw: string) {
    const parsed = parsePayQr(raw)
    if (!parsed) {
      setMessage('Scan a Bucks pay QR.')
      return
    }
    let bankAccount = parsed.bankAccountNumber
    let bankCode = parsed.bankCode
    let bankName = parsed.bankName
    if (parsed.vendorId && !bankAccount) {
      try {
        const res = await fetch(`/api/vendor/pay-card?user_id=${encodeURIComponent(parsed.vendorId)}`, {
          credentials: 'include',
        })
        const json = await res.json()
        if (json.status) {
          bankAccount = String(json.data?.bank_account_number || '')
          bankCode = String(json.data?.bank_code || bankCode || '')
          bankName = String(json.data?.bank_name || bankName || '')
        }
      } catch {
        // keep the QR fields
      }
    }
    const digits = String(bankAccount || '').replace(/\D/g, '').slice(0, 10)
    if (digits.length !== 10) {
      setMessage('That QR has no bank account number yet.')
      return
    }
    setMessage(null)
    if (bankName) setBankQuery(bankName)
    setForm((current) => ({
      ...current,
      accountNumber: digits,
      bankCode: bankCode || current.bankCode,
      accountName: '',
    }))
  }

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
        !current.bankCode || next.some((bank) => bank.code === current.bankCode)
          ? current
          : { ...current, bankCode: '' },
      )
    }
  }

  useEffect(() => {
    setBeneficiaries(readBeneficiaries(userId))
  }, [userId])

  useEffect(() => {
    loadHistory().catch(() => setWithdrawals([]))
    void refreshWallet()
  }, [refreshWallet, userId])

  useEffect(() => {
    let cancelled = false
    fetch('/api/wallet?history=0', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (cancelled || !json.status) return
        const rates = json.data?.rates as
          | { free_under_used_today?: number; payout_provider?: FeeProvider }
          | undefined
        if (typeof rates?.free_under_used_today === 'number') {
          setFreeUsedToday(Math.max(0, Math.floor(rates.free_under_used_today)))
        }
        if (rates?.payout_provider === 'squad' || rates?.payout_provider === 'paystack') {
          setPayoutProvider(rates.payout_provider)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [userId])

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
      return quoteWithdrawBu(Number(form.buAmount), {
        provider: payoutProvider,
        freeUsedToday,
      })
    } catch (error) {
      if (error instanceof WalletAmountError) return { error: error.message }
      return { error: 'Enter a valid amount' }
    }
  }, [form.buAmount, freeUsedToday, payoutProvider])

  const readyQuote = quote && !('error' in quote) ? quote : null
  const quoteError = quote && 'error' in quote ? quote.error : null
  const bank = banks.find((item) => item.code === form.bankCode)
  const insufficient =
    readyQuote != null && buBalance != null && buBalance + 1e-9 < readyQuote.totalDebitBu
  const canSend =
    Boolean(readyQuote) &&
    !insufficient &&
    form.accountNumber.length === 10 &&
    Boolean(form.accountName) &&
    Boolean(form.bankCode) &&
    !resolving &&
    !busy

  const bankSuggestions = useMemo(() => {
    const q = bankQuery.trim().toLowerCase()
    // Only suggest after the user types — never show a default bank list.
    if (!q) return []
    return banks
      .filter((item) => item.name.toLowerCase().includes(q) || item.code.includes(q))
      .slice(0, 8)
  }, [bankQuery, banks])

  useEffect(() => {
    if (!bankMenuOpen) return
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const node = bankPickerRef.current
      if (!node) return
      if (event.target instanceof Node && !node.contains(event.target)) {
        setBankMenuOpen(false)
        if (bank) setBankQuery(bank.name)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [bankMenuOpen, bank])

  useEffect(() => {
    if (bank && !bankMenuOpen) setBankQuery(bank.name)
  }, [bank?.code, bank?.name, bankMenuOpen])

  const pastReceivers = useMemo(() => uniqueReceivers(withdrawals), [withdrawals])
  const recentReceivers = pastReceivers.slice(0, 3)

  const searchableReceivers = useMemo(() => {
    const map = new Map<string, BankReceiver>()
    for (const row of beneficiaries) map.set(receiverKey(row), row)
    for (const row of pastReceivers) {
      if (!map.has(receiverKey(row))) map.set(receiverKey(row), row)
    }
    return Array.from(map.values())
  }, [beneficiaries, pastReceivers])

  const searchHits = useMemo(() => {
    const q = receiverSearch.trim().toLowerCase()
    if (!q) return []
    return searchableReceivers.filter((row) => {
      const hay = `${row.accountName} ${row.bankName} ${row.accountNumber}`.toLowerCase()
      return hay.includes(q)
    })
  }, [receiverSearch, searchableReceivers])

  const formReceiverKey =
    form.accountNumber.length === 10 && form.bankCode
      ? receiverKey({ bankCode: form.bankCode, accountNumber: form.accountNumber })
      : ''
  const alreadyBeneficiary = Boolean(
    formReceiverKey && beneficiaries.some((row) => receiverKey(row) === formReceiverKey),
  )

  function pickBank(option: BankOption) {
    setBankQuery(option.name)
    setBankMenuOpen(false)
    setForm((current) => ({
      ...current,
      bankCode: option.code,
      accountName: '',
    }))
  }

  function applyReceiver(receiver: BankReceiver) {
    setMessage(null)
    setReceiverSearch('')
    setSaveBeneficiary(false)
    setBankQuery(receiver.bankName)
    setBankMenuOpen(false)
    setForm((current) => ({
      ...current,
      bankCode: receiver.bankCode,
      accountNumber: receiver.accountNumber,
      accountName: receiver.accountName,
    }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function persistBeneficiary(receiver: BankReceiver) {
    if (!userId) return
    const next = [receiver, ...beneficiaries.filter((row) => receiverKey(row) !== receiverKey(receiver))]
    writeBeneficiaries(userId, next)
    setBeneficiaries(next)
  }

  function removeBeneficiary(receiver: BankReceiver) {
    if (!userId) return
    const next = beneficiaries.filter((row) => receiverKey(row) !== receiverKey(receiver))
    writeBeneficiaries(userId, next)
    setBeneficiaries(next)
  }

  function openPin() {
    if (!readyQuote) return
    if (insufficient) {
      setMessage(
        'Insufficient account',
      )
      return
    }
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
      applySpendBu(readyQuote.totalDebitBu)
      const row = json.data as WithdrawalRequest & {
        invoice_number?: string
        remark?: string | null
        bank_naira?: number
      }
      if (saveBeneficiary || alreadyBeneficiary) {
        persistBeneficiary({
          bankCode: form.bankCode,
          bankName: bank?.name ?? row.bank_name ?? 'Bank',
          accountNumber: form.accountNumber.replace(/\D/g, ''),
          accountName: form.accountName.trim() || row.account_name,
        })
      }
      setInvoice({
        number: invoiceNumberFromId(String(row.invoice_number || row.id)),
        issuedAt: new Date().toISOString(),
        kind: 'bank',
        fromName: displayName || 'Ƀucks wallet',
        toName: `${row.account_name} · ${row.bank_name}`,
        toId: form.accountNumber.replace(/\D/g, '') || row.account_number,
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
      setSaveBeneficiary(false)
      await loadHistory()
      await refreshWallet()
    } catch {
      setBusy(false)
      setPinOpen(false)
      setMessage('Could not reach ɃU.')
    }
  }

  function ReceiverRow({
    receiver,
    meta,
    onRemove,
  }: {
    receiver: BankReceiver
    meta?: string
    onRemove?: () => void
  }) {
    return (
      <div className="bu-glass-soft rounded-2xl px-3 py-2.5">
        <div className="flex items-center gap-2">
          <BankLogo bankCode={receiver.bankCode} bankName={receiver.bankName} className="h-8 w-8" />
          <button type="button" onClick={() => applyReceiver(receiver)} className="bu-press min-w-0 flex-1 text-left">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-sm font-semibold">{receiver.accountName}</h3>
              <span className="bu-glass-dark shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-neutral-800">
                {receiver.bankName}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {maskNuban(receiver.accountNumber)}
              {meta ? ` · ${meta}` : ''}
            </p>
          </button>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-white/50 hover:text-destructive"
              aria-label="Remove beneficiary"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  const fieldClass =
    'mt-1.5 h-12 w-full rounded-xl border border-neutral-200/80 bg-secondary px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/35 focus:bg-white'

  return (
    <div className="space-y-5 bg-transparent pb-28 pt-4 text-neutral-950">
      <div className="px-4">
        <div className="bu-well-navy relative mt-1 overflow-hidden rounded-[30px] p-5 text-white shadow-[0_20px_48px_rgba(11,23,51,0.32)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,rgba(255,255,255,0.26)_0%,transparent_40%,rgba(255,255,255,0.08)_100%)]" />
          <div className="pointer-events-none absolute -right-10 top-0 h-40 w-40 rounded-full bg-cyan-300/15 blur-3xl" />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/55">To Bank</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Send to bank</h1>
              </div>
              <span className="bu-glass-dark rounded-full px-3 py-1 text-[11px] font-medium text-white/90">
                Min {BU_MIN_WITHDRAW.toLocaleString('en-NG')} ɃU
              </span>
            </div>

            <div className="mt-5 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-white/65">Available</p>
                <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">
                  {buBalance == null ? '…' : `Ƀ ${formatBu(buBalance)}`}
                </p>
              </div>
              <p className="pb-1 text-right text-[11px] text-white/55">
                Live · 1 ɃU = ₦{BU_NAIRA_VALUE.toLocaleString('en-NG')}
              </p>
            </div>

              <div className="bu-glass-dark mt-4 rounded-2xl px-3 pb-1 pt-2">
              <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-white/50">Balance trend</p>
              <BalanceSparkline
                gradientId="bu-bank-balance-fill"
                ready={spark.ready}
                values={spark.values}
              />
            </div>
          </div>
        </div>

        {beneficiaries.length > 0 ? (
          <div className="mt-5">
            <h3 className="mb-2.5 text-sm font-semibold tracking-wide text-neutral-700">Beneficiaries</h3>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {beneficiaries.map((receiver) => (
                <div
                  key={receiverKey(receiver)}
                  className="bu-glass-soft relative min-w-[9rem] shrink-0 rounded-2xl"
                >
                  <button
                    type="button"
                    onClick={() => applyReceiver(receiver)}
                    className="bu-press flex w-full items-start gap-2 px-3 py-2.5 pr-8 text-left"
                  >
                    <BankLogo bankCode={receiver.bankCode} bankName={receiver.bankName} className="mt-0.5 h-7 w-7" />
                    <span className="min-w-0">
                      <p className="truncate text-sm font-semibold">{receiver.accountName}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{receiver.bankName}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{maskNuban(receiver.accountNumber)}</p>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBeneficiary(receiver)}
                    className="absolute right-1.5 top-1.5 rounded-md p-1 text-muted-foreground hover:bg-white/60 hover:text-destructive"
                    aria-label="Remove beneficiary"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="bu-glass relative mt-4 overflow-hidden rounded-[28px] p-4 sm:p-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(255,255,255,0.55)_0%,transparent_100%)]" />
          <div className="relative space-y-4">
            <div>
              <label className="text-sm font-semibold text-neutral-900">Amount (ɃU)</label>
              <Input
                type="number"
                min={BU_MIN_WITHDRAW}
                step="1"
                inputMode="decimal"
                placeholder={`Minimum ${BU_MIN_WITHDRAW.toLocaleString('en-NG')}`}
                value={form.buAmount}
                onChange={(e) => setForm({ ...form, buAmount: e.target.value })}
                className="mt-2 h-12 w-full rounded-xl border border-neutral-200/80 bg-secondary px-3.5 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/35 focus:bg-white"
              />
              <div className="mt-2.5 grid grid-cols-4 gap-2">
                {BU_BUY_PRESETS.filter((preset) => preset >= BU_MIN_WITHDRAW).map((preset) => {
                  const active = form.buAmount === String(preset)
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setForm({ ...form, buAmount: String(preset) })}
                      className={`bu-press rounded-full border px-2 py-2 text-center text-xs font-semibold transition ${
                        active
                          ? 'border-neutral-950 bg-neutral-950 text-white'
                          : 'border-neutral-200/90 bg-white text-neutral-800'
                      }`}
                    >
                      Ƀ {preset.toLocaleString('en-NG')}
                    </button>
                  )
                })}
              </div>
              {readyQuote ? (
                <div className="bu-glass-soft mt-3 rounded-2xl px-3 py-2.5 text-xs text-neutral-600">
                  <div className="flex items-center justify-between gap-2">
                    <span>Bank receives</span>
                    <span className="font-semibold text-neutral-950">₦{formatNairaPlain(readyQuote.bankNaira)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span>Fee</span>
                    <span className="font-semibold text-neutral-950">
                      {readyQuote.freeQuotaApplied
                        ? 'Free today'
                        : `Ƀ ${formatBu(readyQuote.totalDebitBu - readyQuote.bu)}`}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span>You pay</span>
                    <span className="font-semibold text-neutral-950">Ƀ {formatBu(readyQuote.totalDebitBu)}</span>
                  </div>
                  {insufficient ? (
                    <p className="mt-1.5 text-destructive">
                      Insufficient account
                    </p>
                  ) : null}
                </div>
              ) : quoteError ? (
                <p className="mt-2 text-xs text-destructive">{quoteError}</p>
              ) : null}
            </div>

            <div className="bu-glass-soft rounded-[22px] p-3.5">
              <div className="mb-3 flex items-center gap-2">
                <BankLogo bankCode={form.bankCode} bankName={bank?.name} className="h-9 w-9" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Receiver</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {bank?.name || 'Choose bank'}
                  </p>
                </div>
              </div>

              <label className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                Bank
              </label>
              <div ref={bankPickerRef} className="relative mt-1.5">
                <div className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/55 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] focus-within:border-primary/40 focus-within:bg-white/75">
                  <input
                    value={bankQuery}
                    onChange={(e) => {
                      const next = e.target.value
                      setBankQuery(next)
                      setBankMenuOpen(next.trim().length > 0)
                      const exact = banks.find((item) => item.name.toLowerCase() === next.trim().toLowerCase())
                      if (exact) {
                        setForm((current) =>
                          current.bankCode === exact.code
                            ? current
                            : { ...current, bankCode: exact.code, accountName: '' },
                        )
                      } else if (form.bankCode) {
                        setForm((current) => ({ ...current, bankCode: '', accountName: '' }))
                      }
                    }}
                    onFocus={() => {
                      if (bankQuery.trim()) setBankMenuOpen(true)
                    }}
                    placeholder="Type bank name"
                    autoComplete="off"
                    className="h-11 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
                {bankMenuOpen && bankQuery.trim() ? (
                  <div className="bu-glass absolute left-0 right-0 z-30 mt-1.5 max-h-56 overflow-y-auto rounded-2xl p-1.5 shadow-[0_16px_40px_rgba(11,23,51,0.16)]">
                    {bankSuggestions.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-muted-foreground">No matching banks</p>
                    ) : (
                      bankSuggestions.map((item) => (
                        <button
                          key={item.code}
                          type="button"
                          onClick={() => pickBank(item)}
                          className={`bu-press flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ${
                            item.code === form.bankCode ? 'bg-neutral-950 text-white' : 'hover:bg-white/70'
                          }`}
                        >
                          <BankLogo bankCode={item.code} bankName={item.name} className="h-7 w-7" />
                          <span className="truncate text-sm font-medium">{item.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>

              <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                Account number
              </label>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="Account number"
                  value={form.accountNumber}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      accountNumber: e.target.value.replace(/\D/g, '').slice(0, 10),
                      accountName: '',
                    })
                  }
                  className={fieldClass}
                />
                <ScanAccountButton onScan={(raw) => void fillBankFromScan(raw)} />
              </div>
              {(resolving || form.accountName || form.accountNumber.length === 10) && (
                <div className="mt-2.5 flex items-center gap-2 rounded-2xl bg-white/55 px-3 py-2 text-sm">
                  {resolving ? (
                    <p className="text-muted-foreground">Looking up account…</p>
                  ) : form.accountName ? (
                    <>
                      <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                      <p className="truncate font-semibold text-neutral-950">{form.accountName}</p>
                    </>
                  ) : (
                    <p className="text-destructive">Account name not found</p>
                  )}
                </div>
              )}

              {form.accountNumber.length === 10 && form.accountName ? (
                <button
                  type="button"
                  disabled={alreadyBeneficiary}
                  onClick={() => {
                    if (alreadyBeneficiary) return
                    setSaveBeneficiary((value) => !value)
                  }}
                  className={`bu-press mt-3 flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                    alreadyBeneficiary || saveBeneficiary
                      ? 'bg-neutral-950 text-white'
                      : 'bg-white/60 text-neutral-800'
                  }`}
                >
                  <Star
                    className={`h-4 w-4 shrink-0 ${
                      alreadyBeneficiary || saveBeneficiary ? 'fill-current' : ''
                    }`}
                  />
                  <span className="font-medium">
                    {alreadyBeneficiary ? 'Saved beneficiary' : saveBeneficiary ? 'Will save beneficiary' : 'Add beneficiary'}
                  </span>
                </button>
              ) : null}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                Remarks
              </label>
              <Input
                maxLength={160}
                placeholder="Optional note"
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                className={fieldClass}
              />
            </div>

            {message ? <p className="text-sm text-destructive">{message}</p> : null}

            <Button
              type="button"
              onClick={openPin}
              disabled={!canSend}
              className="bu-press h-12 w-full rounded-2xl bg-neutral-950 text-base font-semibold text-white shadow-[0_14px_32px_rgba(11,23,51,0.28)] hover:bg-neutral-900 disabled:shadow-none"
            >
              Send to bank
            </Button>
          </div>
        </div>

        <div className="mt-7">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold">Recent sends</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Tap to fill and send again</p>
            </div>
          </div>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={receiverSearch}
              onChange={(e) => setReceiverSearch(e.target.value)}
              placeholder="Search receivers"
              className={`${fieldClass} !mt-0 pl-10`}
            />
          </div>

          <div className="space-y-2">
            {receiverSearch.trim() ? (
              searchHits.length === 0 ? (
                <div className="bu-glass-soft rounded-2xl px-6 py-8 text-center">
                  <p className="text-sm text-muted-foreground">No matching receivers</p>
                </div>
              ) : (
                searchHits.map((receiver) => (
                  <ReceiverRow
                    key={receiverKey(receiver)}
                    receiver={receiver}
                    onRemove={
                      beneficiaries.some((row) => receiverKey(row) === receiverKey(receiver))
                        ? () => removeBeneficiary(receiver)
                        : undefined
                    }
                  />
                ))
              )
            ) : recentReceivers.length === 0 ? (
              <div className="bu-glass-soft rounded-2xl px-6 py-8 text-center">
                <p className="text-sm text-muted-foreground">No bank sends yet</p>
              </div>
            ) : (
              recentReceivers.map((receiver) => {
                const last = withdrawals.find((row) => {
                  const item = withdrawalToReceiver(row)
                  return item && receiverKey(item) === receiverKey(receiver)
                })
                return (
                  <button
                    key={receiverKey(receiver)}
                    type="button"
                    onClick={() => applyReceiver(receiver)}
                    className="bu-press bu-glass-soft flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-left"
                  >
                    <BankLogo bankCode={receiver.bankCode} bankName={receiver.bankName} className="h-8 w-8" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="truncate text-sm font-semibold">{receiver.accountName}</h3>
                        <span className="bu-glass-dark shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-neutral-800">
                          {receiver.bankName}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {maskNuban(receiver.accountNumber)}
                        {last?.created_at ? ` · ${formatEventDateTime(last.created_at)}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {last?.public_status === 'completed' ? (
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                        ) : null}
                        {last ? <p className="text-sm font-bold">₦{formatNairaPlain(last.naira)}</p> : null}
                      </div>
                      {last ? <p className="text-[11px] text-muted-foreground">Ƀ {formatBu(last.bu)}</p> : null}
                    </div>
                  </button>
                )
              })
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
