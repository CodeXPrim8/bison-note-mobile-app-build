'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Building2, Check, CheckCircle, ChevronLeft, Copy, Nfc, QrCode, Share2 } from 'lucide-react'
import { WalletPageSummary } from '@/components/wallet-summary'
import { ModeListRow, ModeSegmented } from '@/components/mode-home-shell'
import { useAccount } from '@/components/account-store'
import { BU_MIN_TRANSFER, buFromNaira, formatBu, formatNairaPlain } from '@/lib/bu-rate'
import { formatEventDateTime } from '@/lib/datetime'
import { PURPOSE_IDS, purposeLabel, type PurposeId } from '@/lib/purpose'
import { PurposeIcon } from '@/components/icons/purpose-icons'
import { NGN_BANKS } from '@/lib/payments/ngn-banks'

type PosMode = 'event' | 'business'
type SaleStatus = 'pending_notes' | 'confirmed' | 'notes_issued' | 'cancelled'
type BizTab = 'accept' | 'history'
type EventTab = 'qr' | 'history'
type AcceptMethod = 'bank' | 'qr' | 'contactless'

type VirtualAccount = {
  bank_name: string | null
  account_number: string
  account_name: string | null
}

function formatNuban(accountNumber: string) {
  const digits = accountNumber.replace(/\D/g, '')
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return digits || accountNumber
}

type PosSale = {
  id: string
  reference: string
  event_id: string | null
  mode: PosMode
  amount_naira: number
  vendor_naira: number
  celebrant_naira: number
  status: SaleStatus
  created_at: string
  metadata?: Record<string, unknown>
}

type TerminalRow = {
  terminal_id: string
  serial_number?: string | null
  label?: string | null
  name?: string | null
  active?: boolean
}

function saleStatusLabel(status: SaleStatus): 'Pending' | 'Received' | 'Reversed' {
  if (status === 'notes_issued') return 'Received'
  if (status === 'cancelled') return 'Reversed'
  return 'Pending'
}

function saleTitle(sale: PosSale, isEventPos: boolean) {
  if (sale.metadata?.kind === 'business_pos_terminal') return 'Contactless sale'
  if (isEventPos) return 'Event POS sale'
  return 'Business POS sale'
}

export default function VendorPOS({
  eventId,
  eventTitle,
  onBack,
}: {
  eventId?: string | null
  eventTitle?: string | null
  onBack?: () => void
} = {}) {
  const { userId, canVendor, refreshWallet } = useAccount()
  const isEventPos = Boolean(eventId)
  const [tab, setTab] = useState<BizTab | EventTab>(isEventPos ? 'qr' : 'accept')
  const [acceptMethod, setAcceptMethod] = useState<AcceptMethod | null>(null)
  const [sales, setSales] = useState<PosSale[]>([])
  const [resolvedTitle, setResolvedTitle] = useState(eventTitle || '')
  const [qrImage, setQrImage] = useState('')
  const [bizProfile, setBizProfile] = useState({
    business_name: '',
    category: '' as PurposeId | '',
    settlement: 'wallet' as 'wallet' | 'bank',
    bank_name: '',
    bank_code: '',
    bank_account_number: '',
    phone: '',
    logo: '',
  })
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [bankAccountName, setBankAccountName] = useState('')
  const [bankResolving, setBankResolving] = useState(false)
  const [bankHint, setBankHint] = useState<string | null>(null)
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccount | null>(null)
  const [vaLoading, setVaLoading] = useState(false)
  const [vaError, setVaError] = useState<string | null>(null)
  const [copiedAccount, setCopiedAccount] = useState(false)

  const [activeTerminal, setActiveTerminal] = useState<TerminalRow | null>(null)
  const [availableTerminals, setAvailableTerminals] = useState<TerminalRow[]>([])
  const [presence, setPresence] = useState<{ online: boolean; available: boolean } | null>(null)
  const [paystackReady, setPaystackReady] = useState(true)
  const [terminalIdInput, setTerminalIdInput] = useState('')
  const [chargeAmount, setChargeAmount] = useState('')
  const [chargeNote, setChargeNote] = useState('')
  const [chargeRef, setChargeRef] = useState<string | null>(null)
  const [chargeStatus, setChargeStatus] = useState<string | null>(null)

  const loadSales = useCallback(async () => {
    if (!userId || !canVendor) return
    try {
      const salesRes = await fetch('/api/pos/sales', { credentials: 'include' })
      const salesJson = await salesRes.json()
      if (salesJson.status) setSales((salesJson.data?.sales ?? []) as PosSale[])

      if (isEventPos && eventId && !eventTitle) {
        const linksRes = await fetch('/api/pos/vendors?mine=1', { credentials: 'include' })
        const linksJson = await linksRes.json()
        if (linksJson.status) {
          const links = (linksJson.data?.links ?? []) as Array<{
            event_id: string
            event_title?: string
            status: string
          }>
          const match = links.find((row) => row.event_id === eventId && row.status === 'approved')
          if (match?.event_title) setResolvedTitle(match.event_title)
        }
      }
    } catch {
      setMessage('Could not load POS.')
    }
  }, [userId, canVendor, isEventPos, eventId, eventTitle])

  const loadTerminal = useCallback(async () => {
    if (!userId || !canVendor || isEventPos) return
    try {
      const res = await fetch('/api/pos/terminal', { credentials: 'include' })
      const json = await res.json()
      if (!json.status) return
      setActiveTerminal((json.data?.active as TerminalRow | null) ?? null)
      setAvailableTerminals((json.data?.available ?? []) as TerminalRow[])
      setPresence((json.data?.presence as { online: boolean; available: boolean } | null) ?? null)
      setPaystackReady(Boolean(json.data?.paystack_ready))
    } catch {
      // keep previous
    }
  }, [userId, canVendor, isEventPos])

  useEffect(() => {
    void loadSales()
    void loadTerminal()
  }, [loadSales, loadTerminal])

  useEffect(() => {
    if (eventTitle) setResolvedTitle(eventTitle)
  }, [eventTitle])

  useEffect(() => {
    if (!userId || isEventPos) {
      setVirtualAccount(null)
      setVaError(null)
      setVaLoading(false)
      return
    }
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
          setVaError('Could not load bank account for Naira transfers')
        }
      })
      .finally(() => {
        if (!cancelled) setVaLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId, isEventPos])

  useEffect(() => {
    if (!userId) {
      setQrImage('')
      return
    }
    if (isEventPos && !eventId) {
      setQrImage('')
      return
    }
    // Only generate QR when needed (event POS always, business when QR selected)
    if (!isEventPos && acceptMethod !== 'qr') return
    const payload = JSON.stringify(
      isEventPos
        ? {
            type: 'pos',
            vendor_id: userId,
            event_id: eventId,
            mode: 'event',
            label: resolvedTitle ? `Event POS · ${resolvedTitle}` : 'Event POS',
          }
        : {
            type: 'pos',
            vendor_id: userId,
            mode: 'business',
            label: bizProfile.business_name || 'Business POS',
            business_name: bizProfile.business_name || undefined,
            account_number: bizProfile.phone || undefined,
            bank_account_number: bizProfile.bank_account_number || virtualAccount?.account_number || undefined,
            bank_code: bizProfile.bank_code || undefined,
            bank_name: bizProfile.bank_name || virtualAccount?.bank_name || undefined,
            category: bizProfile.category || undefined,
          },
    )
    void QRCode.toDataURL(payload, { width: 280, margin: 1 }).then(setQrImage).catch(() => setQrImage(''))
  }, [userId, isEventPos, eventId, resolvedTitle, acceptMethod, bizProfile, virtualAccount])

  async function handleCopyAccount() {
    if (!virtualAccount?.account_number) return
    try {
      await navigator.clipboard.writeText(virtualAccount.account_number)
      setCopiedAccount(true)
      window.setTimeout(() => setCopiedAccount(false), 1600)
    } catch {
      setCopiedAccount(false)
    }
  }

  async function handleShareAccount() {
    if (!virtualAccount?.account_number) return
    const bank = virtualAccount.bank_name || 'Bank'
    const name = virtualAccount.account_name || 'BUCKS'
    const text = `Pay via bank transfer\nBank: ${bank}\nAccount name: ${name}\nAccount number: ${virtualAccount.account_number}`
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Business POS bank account', text })
        return
      }
      await handleCopyAccount()
    } catch {
      // cancelled
    }
  }

  useEffect(() => {
    if (!chargeRef || chargeStatus === 'paid' || chargeStatus === 'failed') return
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/pos/terminal/charge?reference=${encodeURIComponent(chargeRef)}`, {
            credentials: 'include',
          })
          const json = await res.json()
          if (!json.status) return
          const status = String(json.data?.charge?.status ?? '')
          setChargeStatus(status)
          if (status === 'paid') {
            await loadSales()
            void refreshWallet()
          }
        } catch {
          // ignore poll errors
        }
      })()
    }, 2500)
    return () => window.clearInterval(timer)
  }, [chargeRef, chargeStatus, loadSales, refreshWallet])

  async function patchSale(saleId: string, status: SaleStatus) {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/pos/sales', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_id: saleId, status }),
      })
      const json = await res.json()
      setBusy(false)
      if (!json.status) {
        setMessage(json.message ?? 'Could not update sale')
        return
      }
      await loadSales()
    } catch {
      setBusy(false)
      setMessage('Could not update sale')
    }
  }

  async function linkTerminal(terminalId: string) {
    if (!terminalId.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/pos/terminal', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link', terminal_id: terminalId.trim() }),
      })
      const json = await res.json()
      setBusy(false)
      if (!json.status) {
        setMessage(json.message ?? 'Could not link terminal')
        return
      }
      setTerminalIdInput('')
      await loadTerminal()
    } catch {
      setBusy(false)
      setMessage('Could not link terminal')
    }
  }

  async function unlinkTerminal() {
    if (!activeTerminal?.terminal_id) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/pos/terminal', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlink', terminal_id: activeTerminal.terminal_id }),
      })
      const json = await res.json()
      setBusy(false)
      if (!json.status) {
        setMessage(json.message ?? 'Could not unlink terminal')
        return
      }
      await loadTerminal()
    } catch {
      setBusy(false)
      setMessage('Could not unlink terminal')
    }
  }

  async function pushContactlessCharge() {
    const amount = Number(chargeAmount)
    if (!Number.isFinite(amount) || amount + 1e-9 < BU_MIN_TRANSFER) {
      setMessage(`Minimum charge is ₦${BU_MIN_TRANSFER}`)
      return
    }
    setBusy(true)
    setMessage(null)
    setChargeStatus(null)
    setChargeRef(null)
    try {
      const res = await fetch('/api/pos/terminal/charge', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, note: chargeNote || null }),
      })
      const json = await res.json()
      setBusy(false)
      if (!json.status) {
        setMessage(json.message ?? 'Could not push charge')
        return
      }
      setChargeRef(String(json.data?.reference ?? ''))
      setChargeStatus(String(json.data?.charge?.status ?? 'pushed'))
      setMessage(null)
    } catch {
      setBusy(false)
      setMessage('Could not push charge to terminal')
    }
  }

  const scopedSales = useMemo(() => {
    if (isEventPos && eventId) {
      return sales.filter((sale) => sale.mode === 'event' && sale.event_id === eventId)
    }
    return sales.filter((sale) => sale.mode === 'business')
  }, [sales, isEventPos, eventId])

  const qrPayload = useMemo(
    () =>
      JSON.stringify(
        isEventPos
          ? { type: 'pos', vendor_id: userId, event_id: eventId, mode: 'event' }
          : {
              type: 'pos',
              vendor_id: userId,
              mode: 'business',
              label: bizProfile.business_name || 'Business POS',
              business_name: bizProfile.business_name || undefined,
              account_number: bizProfile.phone || undefined,
              bank_account_number: bizProfile.bank_account_number || virtualAccount?.account_number || undefined,
              bank_code: bizProfile.bank_code || undefined,
              bank_name: bizProfile.bank_name || virtualAccount?.bank_name || undefined,
              category: bizProfile.category || undefined,
            },
      ),
    [isEventPos, userId, eventId, bizProfile, virtualAccount],
  )

  useEffect(() => {
    if (!userId || isEventPos) return
    void fetch('/api/vendor/profile?logo=1', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => {
        if (!json.status) return
        const data = json.data ?? {}
        setBizProfile({
          business_name: String(data.business_name ?? ''),
          category: (data.category ?? '') as PurposeId | '',
          settlement: data.settlement === 'bank' ? 'bank' : 'wallet',
          bank_name: String(data.bank_name ?? ''),
          bank_code: String(data.bank_code ?? ''),
          bank_account_number: String(data.bank_account_number ?? ''),
          phone: String(data.phone ?? ''),
          logo: typeof data.logo_data_url === 'string' && data.logo_data_url.startsWith('data:') ? data.logo_data_url : '',
        })
      })
      .catch(() => undefined)
  }, [userId, isEventPos])

  function bankDetailsReady(profile: typeof bizProfile) {
    return profile.bank_account_number.replace(/\D/g, '').length === 10 && Boolean(profile.bank_code.trim())
  }

  async function saveBiz(patch: Partial<typeof bizProfile> & { logo_data_url?: string }) {
    const next = { ...bizProfile, ...patch }
    // Never persist bank settlement without a real NUBAN + bank code.
    if (next.settlement === 'bank' && !bankDetailsReady(next)) {
      setBizProfile({ ...next, settlement: 'bank' })
      setBankHint('Add a verified 10-digit account so sales can auto-send to your bank.')
      return
    }
    setBizProfile(next)
    setBankHint(null)
    await fetch('/api/vendor/profile', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_name: next.business_name,
        category: next.category || null,
        settlement: next.settlement,
        bank_name: next.bank_name,
        bank_code: next.bank_code,
        bank_account_number: next.bank_account_number,
        logo_data_url: patch.logo_data_url,
      }),
    })
  }

  useEffect(() => {
    if (bizProfile.settlement !== 'bank') return
    const digits = bizProfile.bank_account_number.replace(/\D/g, '')
    const bankCode = bizProfile.bank_code.trim()
    if (digits.length !== 10 || !bankCode) {
      setBankAccountName('')
      return
    }
    let cancelled = false
    setBankResolving(true)
    const timer = window.setTimeout(() => {
      fetch(
        `/api/wallet/withdraw?account_number=${encodeURIComponent(digits)}&bank_code=${encodeURIComponent(bankCode)}`,
        { credentials: 'include' },
      )
        .then(async (res) => {
          const json = await res.json()
          if (cancelled) return
          if (!json.status) {
            setBankAccountName('')
            setBankHint(json.message || 'Could not verify that account number.')
            return
          }
          setBankAccountName(String(json.data?.account_name || ''))
          setBankHint(null)
          setBizProfile((current) => {
            if (current.settlement !== 'bank') return current
            void fetch('/api/vendor/profile', {
              method: 'PUT',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                business_name: current.business_name,
                category: current.category || null,
                settlement: 'bank',
                bank_name: current.bank_name,
                bank_code: bankCode,
                bank_account_number: digits,
              }),
            })
            return current
          })
        })
        .catch(() => {
          if (!cancelled) {
            setBankAccountName('')
            setBankHint('Could not verify that account number.')
          }
        })
        .finally(() => {
          if (!cancelled) setBankResolving(false)
        })
    }, 450)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [bizProfile.settlement, bizProfile.bank_account_number, bizProfile.bank_code])

  async function downloadQrSheet() {
    const dataUrl = await QRCode.toDataURL(qrPayload, { width: 900, margin: 2, errorCorrectionLevel: 'H' })
    const canvas = document.createElement('canvas')
    canvas.width = 1000
    canvas.height = 1280
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const qr = new Image()
    qr.src = dataUrl
    await qr.decode()
    ctx.drawImage(qr, 50, 180, 900, 900)
    if (bizProfile.logo) {
      const logo = new Image()
      logo.src = bizProfile.logo
      await logo.decode()
      const size = 168
      const x = 500 - size / 2
      const y = 630 - size / 2
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.roundRect(x - 14, y - 14, size + 28, size + 28, 28)
      ctx.fill()
      ctx.drawImage(logo, x, y, size, size)
    }
    ctx.fillStyle = '#0b1733'
    ctx.textAlign = 'center'
    ctx.font = '700 42px sans-serif'
    ctx.fillText(bizProfile.business_name || 'Bucks', 500, 110)
    ctx.font = '600 28px sans-serif'
    ctx.fillText('Scan to pay with Bucks', 500, 1160)
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = 'bucks-scan-to-pay.png'
    link.click()
  }

  const history = useMemo(
    () =>
      [...scopedSales].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [scopedSales],
  )

  if (!canVendor) {
    return (
      <div className="space-y-4 px-4 pb-28 pt-4">
        <WalletPageSummary kicker="Vendor" title="POS" detail="Vendor role required." />
        <p className="text-sm text-muted-foreground">Ask Super Admin to make your account a vendor.</p>
      </div>
    )
  }

  const tabOptions = isEventPos
    ? [
        { id: 'qr', label: 'My QR' },
        { id: 'history', label: 'History' },
      ]
    : [
        { id: 'accept', label: 'Accept' },
        { id: 'history', label: 'History' },
      ]

  return (
    <div className="space-y-6 bg-transparent pb-28 pt-4 text-neutral-950">
      <div className="px-4">
        <WalletPageSummary
          kicker="Vendor"
          title={isEventPos ? 'Ceremonial cash' : 'Business POS'}
          detail={
            isEventPos
              ? `${resolvedTitle || 'Linked event'} · Ceremonial cash QR. Celebrant gets 90%, you keep 10%.`
              : 'Pick how the customer wants to pay. You get 100%.'
          }
        />

        {isEventPos && onBack ? (
          <Button variant="outline" className="mt-3 w-full" onClick={onBack}>
            ← Back to events
          </Button>
        ) : null}

        <div className="mt-4">
          <ModeSegmented
            value={tab}
            onChange={(id) => {
              setTab(id as BizTab)
              if (id !== 'accept') setAcceptMethod(null)
            }}
            options={tabOptions}
          />
        </div>

        {message && <p className="mt-3 text-sm text-destructive">{message}</p>}

        {!isEventPos && tab === 'accept' && (
          <div className="mt-4 space-y-4">
            {!acceptMethod ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Ask the customer how they want to pay, then open that method.
                </p>
                <button
                  type="button"
                  onClick={() => setAcceptMethod('bank')}
                  className="w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-neutral-400"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-white">
                      <Building2 className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Bank transfer</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Customer sends Naira from any Nigerian bank to your receive account.
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setAcceptMethod('qr')}
                  className="w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-neutral-400"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-white">
                      <QrCode className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">ɃU QR</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Customer has ɃU — they scan and pay with PIN.
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setAcceptMethod('contactless')}
                  className="w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-neutral-400"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-white">
                      <Nfc className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Contactless</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Tap Visa/Mastercard or phone on your Paystack Terminal.
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setAcceptMethod(null)}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Change payment method
                </Button>

                {acceptMethod === 'bank' && (
                  <Card className="space-y-4 p-5">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">
                        Bank transfer
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Customer transfers Naira from any Nigerian bank to this account. 1 ɃU = ₦1.
                      </p>
                    </div>
                    {vaLoading ? (
                      <p className="text-sm text-muted-foreground">Loading bank account…</p>
                    ) : virtualAccount ? (
                      <>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Bank
                          </p>
                          <p className="mt-1 text-lg font-semibold">
                            {virtualAccount.bank_name || 'Bank'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Account name
                          </p>
                          <p className="mt-1 text-base font-medium">
                            {virtualAccount.account_name || 'Ƀucks'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Account number
                          </p>
                          <p className="mt-1 font-mono text-3xl font-bold tracking-wide">
                            {formatNuban(virtualAccount.account_number)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            className="flex-1 gap-1.5"
                            onClick={() => void handleCopyAccount()}
                          >
                            {copiedAccount ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                            {copiedAccount ? 'Copied' : 'Copy number'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="flex-1 gap-1.5"
                            onClick={() => void handleShareAccount()}
                          >
                            <Share2 className="h-4 w-4" />
                            Share
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-destructive">
                        {vaError || 'Bank receive account unavailable'}
                      </p>
                    )}
                  </Card>
                )}

                {acceptMethod === 'qr' && (
                  <Card className="flex flex-col items-center gap-3 p-5">
                    <p className="w-full text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">
                      ɃU QR
                    </p>
                    {qrImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={qrImage} alt="POS QR" className="h-56 w-56 rounded-lg bg-white p-2" />
                    ) : (
                      <p className="text-sm text-muted-foreground">Generating QR…</p>
                    )}
                    <p className="text-center text-xs text-muted-foreground">
                      Guests with ɃU scan this QR and pay with PIN. You get 100%.
                    </p>
                    <div className="flex w-full gap-2">
                      <Button type="button" className="flex-1" onClick={() => void downloadQrSheet()}>
                        Download to print
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void navigator.clipboard.writeText(qrPayload)}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy
                      </Button>
                    </div>
                    <label className="w-full text-xs font-semibold text-neutral-500">
                      Business name
                      <Input
                        value={bizProfile.business_name}
                        onChange={(e) => setBizProfile((current) => ({ ...current, business_name: e.target.value }))}
                        onBlur={() => void saveBiz({})}
                        className="mt-1"
                      />
                    </label>
                    <div className="flex w-full flex-wrap gap-2">
                      {PURPOSE_IDS.map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => void saveBiz({ category: bizProfile.category === id ? '' : id })}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            bizProfile.category === id ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-700'
                          }`}
                        >
                          <PurposeIcon purpose={id} className="h-3.5 w-3.5" />
                          {purposeLabel(id)}
                        </button>
                      ))}
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 text-sm">
                      <button
                        type="button"
                        className={`rounded-2xl px-3 py-2 font-semibold ${bizProfile.settlement === 'wallet' ? 'bg-neutral-950 text-white' : 'bg-neutral-100'}`}
                        onClick={() => {
                          setBankHint(null)
                          void saveBiz({ settlement: 'wallet' })
                        }}
                      >
                        Keep in BU wallet
                      </button>
                      <button
                        type="button"
                        className={`rounded-2xl px-3 py-2 font-semibold ${bizProfile.settlement === 'bank' ? 'bg-neutral-950 text-white' : 'bg-neutral-100'}`}
                        onClick={() => void saveBiz({ settlement: 'bank' })}
                      >
                        Send to bank
                      </button>
                    </div>
                    {bizProfile.settlement === 'bank' ? (
                      <div className="w-full space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                        <p className="text-xs font-semibold text-neutral-700">
                          Business bank for auto-settlement
                        </p>
                        <p className="text-[11px] leading-relaxed text-neutral-500">
                          After each POS sale, Ƀucks pays this account (Paystack fees apply). Without a
                          verified account, sales stay in your ɃU wallet.
                        </p>
                        <label className="block text-xs font-semibold text-neutral-500">
                          Bank
                          <select
                            value={bizProfile.bank_code}
                            onChange={(e) => {
                              const code = e.target.value
                              const bank = NGN_BANKS.find((item) => item.code === code)
                              setBizProfile((current) => ({
                                ...current,
                                bank_code: code,
                                bank_name: bank?.name || current.bank_name,
                                settlement: 'bank',
                              }))
                              setBankAccountName('')
                            }}
                            className="mt-1 flex h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-950"
                          >
                            <option value="">Select bank</option>
                            {NGN_BANKS.map((bank) => (
                              <option key={bank.code} value={bank.code}>
                                {bank.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-xs font-semibold text-neutral-500">
                          Account number
                          <Input
                            inputMode="numeric"
                            maxLength={10}
                            value={bizProfile.bank_account_number}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                              setBizProfile((current) => ({
                                ...current,
                                bank_account_number: digits,
                                settlement: 'bank',
                              }))
                              setBankAccountName('')
                            }}
                            placeholder="10-digit NUBAN"
                            className="mt-1 bg-white"
                          />
                        </label>
                        {bankResolving ? (
                          <p className="text-xs text-neutral-500">Checking account…</p>
                        ) : bankAccountName ? (
                          <p className="text-xs font-semibold text-emerald-700">{bankAccountName}</p>
                        ) : null}
                        {bankHint ? <p className="text-xs text-amber-700">{bankHint}</p> : null}
                      </div>
                    ) : null}
                    <label className="w-full text-xs font-semibold text-neutral-500">
                      Logo for the middle of the QR
                      <input
                        type="file"
                        accept="image/*"
                        className="mt-1 block w-full text-sm"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const img = new Image()
                          const url = URL.createObjectURL(file)
                          img.onload = () => {
                            const canvas = document.createElement('canvas')
                            canvas.width = 256
                            canvas.height = 256
                            const ctx = canvas.getContext('2d')
                            if (!ctx) return
                            ctx.fillStyle = '#fff'
                            ctx.fillRect(0, 0, 256, 256)
                            ctx.drawImage(img, 0, 0, 256, 256)
                            const logo = canvas.toDataURL('image/jpeg', 0.86)
                            URL.revokeObjectURL(url)
                            void saveBiz({ logo_data_url: logo, logo } as Partial<typeof bizProfile> & { logo_data_url: string })
                          }
                          img.src = url
                        }}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        navigator.geolocation.getCurrentPosition((pos) => {
                          void fetch('/api/vendor/profile', {
                            method: 'PUT',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              latitude: pos.coords.latitude,
                              longitude: pos.coords.longitude,
                            }),
                          })
                        })
                      }}
                    >
                      Save this place for gift popups
                    </Button>
                  </Card>
                )}

                {acceptMethod === 'contactless' && (
                  <div className="space-y-3">
                    <Card className="space-y-3 p-5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">
                        Contactless
                      </p>
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-950 text-white">
                          <Nfc className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">Paystack Terminal</p>
                          <p className="text-xs text-muted-foreground">
                            Guest taps Visa/Mastercard or phone. Cards from any bank.
                          </p>
                        </div>
                      </div>

                      {!paystackReady ? (
                        <p className="text-sm text-destructive">
                          Paystack is not configured on this environment.
                        </p>
                      ) : null}

                      {activeTerminal ? (
                        <div className="rounded-xl border bg-secondary/40 px-3 py-2 text-sm">
                          <p className="font-medium">
                            {activeTerminal.label || activeTerminal.terminal_id}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ID {activeTerminal.terminal_id}
                            {presence
                              ? ` · ${presence.online && presence.available ? 'Ready' : presence.online ? 'Busy' : 'Offline'}`
                              : ''}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            disabled={busy}
                            onClick={() => void unlinkTerminal()}
                          >
                            Unlink terminal
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Link your commissioned Paystack Terminal.
                          </p>
                          {availableTerminals.length > 0 ? (
                            <div className="space-y-2">
                              {availableTerminals.map((row) => (
                                <Button
                                  key={row.terminal_id}
                                  type="button"
                                  variant="outline"
                                  className="w-full justify-between"
                                  disabled={busy}
                                  onClick={() => void linkTerminal(row.terminal_id)}
                                >
                                  <span className="truncate">{row.name || row.terminal_id}</span>
                                  <span className="text-xs text-muted-foreground">Link</span>
                                </Button>
                              ))}
                            </div>
                          ) : null}
                          <div className="flex gap-2">
                            <Input
                              placeholder="Terminal ID (e.g. 2872S934)"
                              value={terminalIdInput}
                              onChange={(e) => setTerminalIdInput(e.target.value)}
                            />
                            <Button
                              type="button"
                              disabled={busy || !terminalIdInput.trim()}
                              onClick={() => void linkTerminal(terminalIdInput)}
                            >
                              Link
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>

                    <Card className="space-y-3 p-5">
                      <p className="text-sm font-semibold">Charge amount</p>
                      <Input
                        type="number"
                        min={BU_MIN_TRANSFER}
                        placeholder={`₦ amount (min ${BU_MIN_TRANSFER})`}
                        value={chargeAmount}
                        onChange={(e) => setChargeAmount(e.target.value)}
                      />
                      <Input
                        placeholder="Note (optional)"
                        value={chargeNote}
                        onChange={(e) => setChargeNote(e.target.value)}
                      />
                      <Button
                        className="w-full"
                        disabled={busy || !activeTerminal || !chargeAmount}
                        onClick={() => void pushContactlessCharge()}
                      >
                        Push to terminal
                      </Button>
                      {chargeRef ? (
                        <p className="text-xs text-muted-foreground">
                          Ref {chargeRef.slice(0, 16)}… · Status: {chargeStatus || 'waiting'}
                          {chargeStatus === 'paid'
                            ? ' · Paid — mark Received or Reversed under History'
                            : ' · Ask guest to tap on the Terminal'}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Money settles via Paystack; your ɃU wallet is credited 1:1 when the tap
                          succeeds.
                        </p>
                      )}
                      {chargeAmount && Number(chargeAmount) > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Guest pays ₦{formatNairaPlain(Number(chargeAmount))} · you receive Ƀ{' '}
                          {formatBu(Number(chargeAmount))}
                        </p>
                      ) : null}
                    </Card>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {isEventPos && tab === 'qr' && (
          <Card className="mt-4 flex flex-col items-center gap-3 p-5">
            {qrImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrImage} alt="POS QR" className="h-64 w-64 rounded-lg bg-white p-2" />
            ) : (
              <p className="text-sm text-muted-foreground">Generating QR…</p>
            )}
            <p className="text-center text-xs text-muted-foreground">
              Guests scan this QR, pay with ɃU + PIN (90% celebrant · 10% you).
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(qrPayload)}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy QR payload
            </Button>
          </Card>
        )}

        {tab === 'history' && (
          <div className="mt-4 space-y-2">
            {history.length === 0 && (
              <p className="text-sm text-muted-foreground">No POS sales yet.</p>
            )}
            {history.map((sale) => {
              const status = saleStatusLabel(sale.status)
              const isOpen = status === 'Pending'
              return (
                <Card key={sale.id} className="space-y-3 p-4">
                  <ModeListRow
                    title={saleTitle(sale, isEventPos)}
                    detail={`${formatEventDateTime(sale.created_at)} · ${sale.reference.slice(0, 12)} · ${status}`}
                    amount={`${status === 'Reversed' ? '' : '+' }Ƀ ${formatBu(buFromNaira(sale.vendor_naira))}`}
                    amountTone={status === 'Reversed' ? undefined : 'credit'}
                  />
                  <p className="text-xs text-muted-foreground">
                    Guest paid Ƀ {formatBu(buFromNaira(sale.amount_naira))}
                    {isEventPos ? ` · Celebrant Ƀ ${formatBu(buFromNaira(sale.celebrant_naira))}` : ''}
                    {' · '}
                    {status}
                  </p>
                  {isOpen ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void patchSale(sale.id, 'notes_issued')}
                      >
                        <CheckCircle className="mr-1 h-4 w-4" />
                        Mark received
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void patchSale(sale.id, 'cancelled')}
                      >
                        Reverse
                      </Button>
                    </div>
                  ) : null}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
