'use client'

import { useEffect, useRef, useState } from 'react'
import { BalanceSparkline, useBalanceSpark } from '@/components/balance-sparkline'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { User, CheckCircle, AlertCircle, Search, QrCode, Sparkles, Star } from 'lucide-react'
import { TicketQrScanner } from '@/components/web/ticket-qr-scanner'
import { formatEventDateTime } from '@/lib/datetime'
import {
  BU_MIN_SPRAY,
  BU_MIN_TRANSFER,
  BU_SPRAY_NOTES,
  buFromNaira,
  formatBu,
  formatNairaPlain,
  nairaFromBu,
  quotePeerMoveBu,
} from '@/lib/bu-rate'
import { useAccount } from '@/components/account-store'
import { BuInvoiceActions } from '@/components/bu-invoice'
import { PinPadModal } from '@/components/pin-pad-modal'
import { invoiceNumberFromId, type BuInvoice } from '@/lib/invoice/document'
import { historyBucket, walletDirection } from '@/lib/wallet/direction'

interface UserProfile {
  id: string
  username: string
  fullName: string
  verified: boolean
}

interface BUTransfer {
  id: string
  recipientId?: string
  recipientUsername: string
  recipientName: string
  amount: number
  message: string
  date: string
  status: 'completed' | 'pending' | 'failed'
  type: 'transfer' | 'tip'
  invoice: BuInvoice
}

type SavedParty = {
  id: string
  username: string
  fullName: string
  lastAmount?: number
  lastMessage?: string
}

function cleanPartyName(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    if (/^(sent Ƀu|sent bu|received Ƀu|received bu|bu transfer|Ƀu transfer|tip)$/i.test(trimmed)) continue
    const from = trimmed.match(/^(?:sent Ƀu|sent bu|bu transfer)(?: to)?\s+(.+)$/i)
    if (from?.[1]) return from[1].trim()
    const tip = trimmed.match(/^tip (?:sent to|to)\s+(.+)$/i)
    if (tip?.[1]) return tip[1].trim()
    return trimmed
  }
  return ''
}

const FAVORITES_KEY = 'bu_send_favorites'

function readFavorites(): SavedParty[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const item = row as Record<string, unknown>
        const id = String(item.id ?? '').trim()
        const username = String(item.username ?? '').trim()
        const fullName = String(item.fullName ?? '').trim()
        if (!id || !username) return null
        return { id, username, fullName: fullName || username }
      })
      .filter((row): row is SavedParty => Boolean(row))
  } catch {
    return []
  }
}

function writeFavorites(rows: SavedParty[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(rows.slice(0, 40)))
}

export default function SendBU({
  initialIntent,
  onNavigate,
}: {
  initialIntent?: 'tip' | 'transfer'
  onNavigate?: (page: string, data?: unknown) => void
} = {}) {
  const { applySpendBu, refreshWallet, userId, displayName, buBalance } = useAccount()
  const spark = useBalanceSpark(userId, buBalance)
  const homeStep = initialIntent === 'tip' ? 'tip-scan' : 'search'
  const [step, setStep] = useState<'menu' | 'search' | 'confirm' | 'tip-scan' | 'tip-confirm' | 'success' | 'history'>(
    homeStep,
  )
  const [transferType, setTransferType] = useState<'transfer' | 'tip'>(initialIntent === 'tip' ? 'tip' : 'transfer')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)
  const [tipAmount, setTipAmount] = useState('')
  const [scannedQRData, setScannedQRData] = useState<{ userId: string; username: string } | null>(null)
  const [transfers, setTransfers] = useState<BUTransfer[]>([])
  const [searchResults, setSearchResults] = useState<UserProfile[]>([])
  const [favorites, setFavorites] = useState<SavedParty[]>([])
  const [partyTab, setPartyTab] = useState<'beneficiaries' | 'favorites'>('beneficiaries')
  const [message, setMessage] = useState<string | null>(null)
  const [pinOpen, setPinOpen] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinAction, setPinAction] = useState<'transfer' | 'tip' | null>(null)
  const [busy, setBusy] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [pastedQr, setPastedQr] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const lookupSeq = useRef(0)
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lookupAbort = useRef<AbortController | null>(null)

  const [transferForm, setTransferForm] = useState({
    amount: '',
    message: '',
  })
  const [txPin, setTxPin] = useState('')

  useEffect(() => {
    setFavorites(readFavorites())
  }, [])

  useEffect(() => {
    if (!userId) {
      setTransfers([])
      return
    }
    fetch('/api/wallet?history=1&limit=40', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (!json.status) {
          setTransfers([])
          return
        }
        const txs = (json.data?.transactions ?? []) as Array<Record<string, unknown>>
        setTransfers(
          txs
            .filter((tx) => {
              const type = String(tx.type ?? '')
              const description = String(tx.description ?? '')
              const direction =
                tx.direction === 'credit' || tx.direction === 'debit'
                  ? tx.direction
                  : walletDirection({ type, description, metadata: tx.metadata })
              return direction === 'debit' && historyBucket({ type, description }) === 'bu_transfer'
            })
            .map((tx) => {
              const tip = String(tx.type ?? '') === 'tip' || /tip/i.test(String(tx.description ?? ''))
              const meta =
                tx.metadata && typeof tx.metadata === 'object' && !Array.isArray(tx.metadata)
                  ? (tx.metadata as Record<string, unknown>)
                  : {}
              const party =
                cleanPartyName(tx.counterparty, meta.to_name, tx.description, meta.description) ||
                String(tx.counterparty ?? meta.to_name ?? '').trim()
              const recipientId = String(meta.to ?? tx.counterpartyUserId ?? '').trim()
              const amount = buFromNaira(Math.abs(Number(tx.amount ?? 0)))
              const note = typeof tx.note === 'string' ? tx.note : ''
              return {
                id: String(tx.reference || tx.id),
                recipientId: recipientId || undefined,
                recipientUsername: party || String(meta.to_name ?? ''),
                recipientName: party || 'Beneficiary',
                amount,
                message: note,
                date: tx.created_at ? formatEventDateTime(String(tx.created_at)) : '',
                status: 'completed' as const,
                type: tip ? ('tip' as const) : ('transfer' as const),
                invoice: {
                  number: invoiceNumberFromId(String(tx.reference || tx.id)),
                  issuedAt: String(tx.created_at || new Date().toISOString()),
                  kind: tip ? 'tip' : 'transfer',
                  fromName: displayName || 'You',
                  toName: party || 'Recipient',
                  toId: party || undefined,
                  amountBu: amount,
                  amountNaira: Math.abs(Number(tx.amount ?? 0)),
                  note: note || undefined,
                  status: 'Paid',
                } satisfies BuInvoice,
              }
            }),
        )
      })
      .catch(() => setTransfers([]))
  }, [userId, displayName])

  useEffect(() => {
    return () => {
      if (lookupTimer.current) window.clearTimeout(lookupTimer.current)
      lookupAbort.current?.abort()
    }
  }, [])

  const beneficiaries = (() => {
    const seen = new Set<string>()
    const rows: SavedParty[] = []
    for (const transfer of transfers) {
      if (transfer.type === 'tip') continue
      const name = cleanPartyName(transfer.recipientName, transfer.recipientUsername)
      if (!name) continue
      const key = transfer.recipientId || transfer.recipientUsername || name
      if (!key || seen.has(key)) continue
      seen.add(key)
      rows.push({
        id: transfer.recipientId || key,
        username: transfer.recipientUsername || name,
        fullName: name,
        lastAmount: transfer.amount,
        lastMessage: transfer.message || undefined,
      })
    }
    return rows
  })()

  function isFavorite(id: string) {
    return favorites.some((row) => row.id === id)
  }

  function toggleFavorite(party: SavedParty) {
    setFavorites((current) => {
      const exists = current.some((row) => row.id === party.id)
      const next = exists ? current.filter((row) => row.id !== party.id) : [party, ...current]
      writeFavorites(next)
      return next
    })
  }

  async function openSavedParty(party: SavedParty) {
    setTransferType('transfer')
    setMessage(null)
    if (isSelfAccount(party.id)) {
      setMessage('That’s your own account number. You can’t send ɃU to yourself.')
      return
    }
    const looksLikeUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(party.id)
    if (looksLikeUuid) {
      handleSelectUser({
        id: party.id,
        username: party.username,
        fullName: party.fullName,
        verified: true,
      })
      return
    }
    if (party.username.replace(/[^\d]/g, '').length >= 10) {
      handleSearch(party.username)
      return
    }
    setMessage('Could not open that beneficiary. Enter their account number instead.')
  }

  function handleSearch(query: string) {
    setSearchQuery(query)
    const digits = query.replace(/[^\d]/g, '')
    if (lookupTimer.current) window.clearTimeout(lookupTimer.current)
    if (lookupAbort.current) {
      lookupAbort.current.abort()
      lookupAbort.current = null
    }
    if (digits.length < 10) {
      lookupSeq.current += 1
      setLookingUp(false)
      setSearchResults([])
      setMessage(null)
      return
    }
    const seq = ++lookupSeq.current
    setLookingUp(true)
    lookupTimer.current = setTimeout(() => {
      void (async () => {
        const controller = new AbortController()
        lookupAbort.current = controller
        try {
          const res = await fetch('/api/users/lookup', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bu_id: query.trim() }),
            signal: controller.signal,
            cache: 'no-store',
          })
          const json = await res.json()
          if (seq !== lookupSeq.current) return
          setLookingUp(false)
          if (!json.status) {
            setSearchResults([])
            setMessage(json.message ?? 'Could not look up that ɃU ID')
            return
          }
          if (json.data?.exists && json.data.id) {
            const foundId = String(json.data.id)
            if (userId && foundId === userId) {
              setSearchResults([])
              setMessage('That’s your own account number. You can’t send ɃU to yourself.')
              return
            }
            setMessage(null)
            setSearchResults([
              {
                id: foundId,
                username: String(json.data.phone_hint ?? json.data.bu_id),
                fullName: String(json.data.display_name ?? 'ɃU member'),
                verified: true,
              },
            ])
          } else {
            setMessage(null)
            setSearchResults([])
          }
        } catch (error) {
          if (controller.signal.aborted) return
          if (seq !== lookupSeq.current) return
          setLookingUp(false)
          setSearchResults([])
          setMessage('Could not look up that ɃU ID')
        }
      })()
    }, 220)
  }

  function isSelfAccount(candidateId: string) {
    return Boolean(userId && candidateId && userId === candidateId)
  }

  const handleSelectUser = (user: UserProfile) => {
    if (isSelfAccount(user.id)) {
      setMessage('That’s your own account number. You can’t send ɃU to yourself.')
      setSearchResults([])
      return
    }
    setMessage(null)
    setSelectedUser(user)
    setStep('confirm')
    setSearchQuery('')
    setSearchResults([])
  }

  async function sendToUser(
    user: UserProfile,
    amount: number,
    isTip: boolean,
    note: string,
    pin: string,
  ): Promise<true | string> {
    if (isSelfAccount(user.id)) {
      const err = 'That’s your own account number. You can’t send ɃU to yourself.'
      setMessage(err)
      return err
    }
    if (!user.id) {
      const err = 'This recipient has no live ɃU account id.'
      setMessage(err)
      return err
    }
    const minBu = isTip ? BU_MIN_SPRAY : BU_MIN_TRANSFER
    if (amount + 1e-9 < minBu) {
      const err = isTip
        ? `Minimum tip is ${BU_MIN_SPRAY.toLocaleString('en-NG')} ɃU`
        : `Minimum transfer is ${BU_MIN_TRANSFER.toLocaleString('en-NG')} ɃU`
      setMessage(err)
      return err
    }
    if (!/^\d{4,6}$/.test(pin)) {
      const err = 'Enter your transaction PIN. You created it when you registered.'
      setMessage(err)
      return err
    }
    setBusy(true)
    setMessage(null)
    const debitBu = quotePeerMoveBu(amount, isTip ? 'tip' : 'transfer').totalDebitBu
    applySpendBu(debitBu, { refresh: false })
    try {
      const res = await fetch('/api/wallet/transfer', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_user_id: user.id, amount, is_tip: isTip, note, pin }),
      })
      const json = await res.json()
      setBusy(false)
      if (!json.status) {
        void refreshWallet()
        const err = String(json.message ?? 'Transfer failed.')
        setMessage(err)
        return err
      }
      void refreshWallet()
      const data = (json.data ?? {}) as Record<string, unknown>
      const moveId = String(data.invoice_number || Date.now())
      const invoice: BuInvoice = {
        number: invoiceNumberFromId(moveId),
        issuedAt: new Date().toISOString(),
        kind: isTip ? 'tip' : 'transfer',
        fromName: String(data.from_name || displayName || 'You'),
        toName: String(data.to_name || user.fullName || user.username),
        toId: user.username,
        amountBu: amount,
        amountNaira: nairaFromBu(amount),
        note: note || undefined,
        status: 'Paid',
      }
      setTransfers([
        {
          id: moveId,
          recipientId: user.id,
          recipientUsername: user.username,
          recipientName: user.fullName,
          amount,
          message: note,
          date: formatEventDateTime(new Date()),
          status: 'completed',
          type: isTip ? 'tip' : 'transfer',
          invoice,
        },
        ...transfers,
      ])
      return true
    } catch {
      setBusy(false)
      void refreshWallet()
      const err = 'Could not reach ɃU.'
      setMessage(err)
      return err
    }
  }

  function openTransferPin() {
    if (
      !selectedUser ||
      !transferForm.amount ||
      Number.isNaN(Number(transferForm.amount)) ||
      Number(transferForm.amount) + 1e-9 < BU_MIN_TRANSFER
    ) {
      return
    }
    setMessage(null)
    setPinError(null)
    setTxPin('')
    setPinAction('transfer')
    setPinOpen(true)
  }

  function openTipPin() {
    if (!tipAmount || Number.isNaN(Number(tipAmount)) || Number(tipAmount) + 1e-9 < BU_MIN_SPRAY || !scannedQRData) {
      return
    }
    setMessage(null)
    setPinError(null)
    setTxPin('')
    setPinAction('tip')
    setPinOpen(true)
  }

  async function handlePinSubmit(pin: string) {
    setTxPin(pin)
    setPinError(null)
    if (pinAction === 'transfer' && selectedUser) {
      const result = await sendToUser(
        selectedUser,
        Number(transferForm.amount),
        transferType === 'tip',
        transferForm.message,
        pin,
      )
      if (result === true) {
        setPinOpen(false)
        setPinAction(null)
        setTransferForm({ amount: '', message: '' })
        setTxPin('')
        setStep('success')
        return
      }
      setPinError(result)
      return
    }
    if (pinAction === 'tip' && scannedQRData) {
      const result = await sendToUser(
        {
          id: scannedQRData.userId,
          username: scannedQRData.username,
          fullName: scannedQRData.username,
          verified: true,
        },
        Number(tipAmount),
        true,
        'Tip',
        pin,
      )
      if (result === true) {
        setPinOpen(false)
        setPinAction(null)
        setTxPin('')
        setTipAmount('')
        setScannedQRData(null)
        setStep('success')
        return
      }
      setPinError(result)
    }
  }

  function parseReceiveQr(raw: string) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const userId = String(parsed.userId ?? parsed.user_id ?? '')
      const username = String(parsed.phone ?? parsed.username ?? parsed.bu_id ?? '')
      if (!userId) return null
      return { userId, username: username || userId }
    } catch {
      return null
    }
  }

  function handlePosOrReceiveScan(raw: string, mode: 'tip' | 'pay') {
    try {
      const asPos = JSON.parse(raw) as { type?: string }
      if (String(asPos.type ?? '') === 'pos') {
        try {
          sessionStorage.setItem('bu_pos_qr', raw)
        } catch {
          // ignore
        }
        if (onNavigate) {
          onNavigate('pos-pay')
          return
        }
        window.location.assign('/app?page=pos-pay')
        return
      }
    } catch {
      // not JSON / not POS
    }
    const parsed = parseReceiveQr(raw)
    if (!parsed) {
      setMessage('Scan a live receive-ɃU or pay QR, or paste the payload.')
      return
    }
    if (isSelfAccount(parsed.userId)) {
      setMessage(mode === 'tip' ? 'That’s your own QR. You can’t tip yourself.' : 'That’s your own QR.')
      setCameraActive(false)
      return
    }
    setCameraActive(false)
    setMessage(null)
    if (mode === 'pay') {
      handleSelectUser({
        id: parsed.userId,
        username: parsed.username,
        fullName: parsed.username,
        verified: true,
      })
      return
    }
    setScannedQRData(parsed)
    setStep('tip-confirm')
  }

  const handleTipScan = (raw: string) => handlePosOrReceiveScan(raw, 'tip')
  const handlePayScan = (raw: string) => handlePosOrReceiveScan(raw, 'pay')


  return (
    <div className="space-y-6 bg-transparent pb-28 pt-4 text-neutral-950">
      {step === 'tip-scan' && (
        <div className="space-y-4 px-4">
          {initialIntent !== 'tip' ? (
            <button
              type="button"
              onClick={() => setStep('search')}
              className="bu-press inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-white/70 hover:text-neutral-950"
            >
              ← Back
            </button>
          ) : null}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b5cf6]">Instant tip</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[color:var(--bu-navy)]">Give Tip</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">
              Scan the recipient’s QR to tip instantly — performers, hosts, and gifters, digital instead of cash.
            </p>
          </div>

          <div
            className="space-y-4 overflow-hidden rounded-[28px] p-5"
            style={{
              background: 'linear-gradient(180deg, #ffffff 0%, #f7f9ff 100%)',
              border: '1px solid rgba(47,123,255,0.16)',
              boxShadow: '0 18px 40px rgba(47,123,255,0.1), inset 0 1px 0 rgba(255,255,255,1)',
            }}
          >
            {cameraActive ? (
              <div className="overflow-hidden rounded-2xl ring-1 ring-[#2f7bff]/25">
                <TicketQrScanner readerId="bu-tip-reader" active={cameraActive} onScan={handleTipScan} />
              </div>
            ) : (
              <div
                className="relative mx-auto flex aspect-square w-full max-w-[220px] flex-col items-center justify-center overflow-hidden rounded-[24px]"
                style={{
                  background:
                    'radial-gradient(circle at 30% 20%, rgba(34,224,255,0.18), transparent 55%), radial-gradient(circle at 80% 80%, rgba(255,45,149,0.14), transparent 50%), linear-gradient(160deg, #eef3ff, #f8f5ff)',
                  border: '1.5px dashed rgba(47,123,255,0.35)',
                }}
              >
                <QrCode className="relative h-20 w-20 text-[#2f7bff]/70" strokeWidth={1.5} />
                <p className="relative mt-3 px-4 text-center text-xs text-neutral-500">
                  Point the camera at a live receive-ɃU QR
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setCameraActive((open) => !open)}
              className="bu-press flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold text-white"
              style={{
                background: 'linear-gradient(120deg, #2f7bff 0%, #8b5cf6 55%, #ff2d95 120%)',
                boxShadow: '0 14px 28px rgba(47,123,255,0.32)',
              }}
            >
              {cameraActive ? 'Stop scanner' : 'Scan QR Code'}
            </button>
            <div className="relative flex items-center gap-3 py-0.5">
              <div className="h-px flex-1 bg-neutral-200/80" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">or paste</span>
              <div className="h-px flex-1 bg-neutral-200/80" />
            </div>
            <Input
              placeholder="Or paste receive QR payload"
              value={pastedQr}
              onChange={(e) => setPastedQr(e.target.value)}
              className="h-12 rounded-2xl border-white/70 bg-white/70 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] placeholder:text-muted-foreground focus-visible:border-[#2f7bff]/40 focus-visible:ring-[#2f7bff]/20"
            />
            <button
              type="button"
              onClick={() => handleTipScan(pastedQr)}
              className="bu-press flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold text-[color:var(--bu-navy)]"
              style={{
                background: 'rgba(255,255,255,0.9)',
                border: '1px solid rgba(47,123,255,0.2)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,1)',
              }}
            >
              Load recipient
            </button>
            {message ? <p className="text-sm text-destructive">{message}</p> : null}
          </div>

          <div
            className="rounded-[24px] p-4"
            style={{
              background: 'linear-gradient(165deg, rgba(255,255,255,0.95), rgba(239,244,255,0.9))',
              border: '1px solid rgba(47,123,255,0.14)',
            }}
          >
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: 'linear-gradient(120deg, #2f7bff, #8b5cf6)' }}
              >
                <AlertCircle className="h-4 w-4" />
              </span>
              <div className="text-sm text-neutral-600">
                <p className="font-semibold text-[color:var(--bu-navy)]">How it works</p>
                <ul className="mt-1.5 space-y-1 text-neutral-500">
                  <li>· Recipient shows their QR code</li>
                  <li>· You scan and enter a tip amount</li>
                  <li>· Tip lands in their wallet instantly</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'tip-confirm' && scannedQRData && (
        <div className="space-y-4 px-4">
          <button
            type="button"
            onClick={() => {
              setStep('tip-scan')
              setScannedQRData(null)
              setTipAmount('')
            }}
            className="bu-press inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-white/70 hover:text-neutral-950"
          >
            ← Back
          </button>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b5cf6]">Confirm</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[color:var(--bu-navy)]">Confirm Tip</h2>
          </div>

          <div
            className="flex items-center gap-3 rounded-[24px] p-4"
            style={{
              background: 'linear-gradient(120deg, rgba(47,123,255,0.12), rgba(139,92,246,0.12))',
              border: '1px solid rgba(47,123,255,0.2)',
            }}
          >
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-white"
              style={{ background: 'linear-gradient(120deg, #2f7bff 0%, #8b5cf6 55%, #ff2d95 120%)' }}
            >
              <Sparkles className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold text-[color:var(--bu-navy)]">{scannedQRData.username}</h3>
              <p className="mt-0.5 text-sm text-neutral-500">QR scanned — ready to tip</p>
            </div>
          </div>

          <div
            className="space-y-4 rounded-[28px] p-5"
            style={{
              background: 'linear-gradient(180deg, #ffffff 0%, #f7f9ff 100%)',
              border: '1px solid rgba(47,123,255,0.16)',
              boxShadow: '0 18px 40px rgba(47,123,255,0.08), inset 0 1px 0 rgba(255,255,255,1)',
            }}
          >
            <div>
              <label className="text-sm font-semibold text-[color:var(--bu-navy)]">Tip Amount (Ƀ)</label>
              <Input
                type="number"
                min={BU_MIN_SPRAY}
                step="1"
                placeholder={`Minimum ${BU_MIN_SPRAY.toLocaleString('en-NG')} ɃU`}
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                className="mt-2 h-12 rounded-2xl border-white/70 bg-white/70 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] placeholder:text-muted-foreground focus-visible:border-[#2f7bff]/40 focus-visible:ring-[#2f7bff]/20"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {BU_SPRAY_NOTES.map((note) => {
                  const selected = tipAmount === String(note)
                  return (
                    <button
                      key={note}
                      type="button"
                      onClick={() => setTipAmount(String(note))}
                      className="bu-press rounded-full px-3 py-1.5 text-xs font-semibold"
                      style={
                        selected
                          ? {
                              background: 'linear-gradient(120deg, #2f7bff 0%, #8b5cf6 55%, #ff2d95 120%)',
                              color: '#fff',
                              boxShadow: '0 8px 18px rgba(47,123,255,0.28)',
                            }
                          : {
                              background: 'rgba(255,255,255,0.9)',
                              border: '1px solid rgba(47,123,255,0.2)',
                              color: 'var(--bu-navy)',
                            }
                      }
                    >
                      Ƀ {note.toLocaleString('en-NG')}
                    </button>
                  )
                })}
              </div>
              {tipAmount && !isNaN(Number(tipAmount)) ? (
                <p className="mt-1 text-xs text-neutral-500">
                  Equivalent: ₦{formatNairaPlain(nairaFromBu(Number(tipAmount)))}
                </p>
              ) : null}
            </div>

            <div
              className="rounded-2xl p-3"
              style={{
                background: 'rgba(47,123,255,0.06)',
                border: '1px solid rgba(47,123,255,0.14)',
              }}
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#2f7bff]" />
                <p className="text-xs text-neutral-600">
                  Tip will be sent instantly to {scannedQRData.username}&apos;s wallet. Peer-to-peer — no cash needed.
                </p>
              </div>
            </div>

            {message ? <p className="text-sm text-destructive">{message}</p> : null}
            <button
              type="button"
              onClick={openTipPin}
              disabled={busy || !tipAmount || isNaN(Number(tipAmount)) || Number(tipAmount) + 1e-9 < BU_MIN_SPRAY}
              className="bu-press flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
              style={{
                background: 'linear-gradient(120deg, #2f7bff 0%, #8b5cf6 55%, #ff2d95 120%)',
                boxShadow: '0 14px 28px rgba(47,123,255,0.32)',
              }}
            >
              {busy ? 'Sending…' : 'Give Tip'}
            </button>
          </div>
        </div>
      )}

      {step === 'search' && (
        <>
          <div className="px-4 pb-6">
            <div
              className="relative overflow-hidden rounded-[30px] p-5 text-white shadow-[0_18px_40px_rgba(11,23,51,0.26)]"
              style={{
                background:
                  'linear-gradient(165deg, #2a6fe0 0%, #1f5fd0 42%, #174db8 100%)',
                boxShadow:
                  '0 18px 40px rgba(11,23,51,0.26), inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(0,0,0,0.12)',
              }}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/35" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.1)_0%,transparent_34%)]" />
              <div className="relative">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/55">To Ƀucks</p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight">Send ɃU</h1>
                </div>
                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-white/65">Available</p>
                    <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">
                      {buBalance == null ? '…' : `Ƀ ${formatBu(buBalance)}`}
                    </p>
                  </div>
                  <p className="max-w-[9.5rem] pb-1 text-right text-[11px] leading-snug text-white/55">
                    Enter account number, then confirm the name
                  </p>
                </div>
                <div className="bu-glass-dark mt-4 rounded-2xl px-3 pb-1 pt-2">
                  <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-white/50">Balance trend</p>
                  <BalanceSparkline
                    gradientId="bu-send-balance-fill"
                    ready={spark.ready}
                    values={spark.values}
                  />
                </div>
              </div>
            </div>

            <div className="bu-glass mt-4 overflow-hidden rounded-[26px] p-4">
              <label
                htmlFor="bu-account-number"
                className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500"
              >
                Account number
              </label>
              <div className="mt-2 flex items-center gap-2.5 rounded-2xl border border-white/70 bg-white/55 px-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] focus-within:border-primary/40 focus-within:bg-white/75">
                <Search className="h-4 w-4 shrink-0 text-neutral-500" />
                <Input
                  id="bu-account-number"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="Phone used as ɃU account"
                  value={searchQuery}
                  onChange={(e) => void handleSearch(e.target.value)}
                  className="h-11 border-0 bg-transparent px-0 text-sm font-medium text-neutral-950 shadow-none placeholder:text-neutral-400 focus-visible:ring-0"
                />
              </div>
            </div>

            <div className="bu-glass-soft mt-3 space-y-3 rounded-[26px] p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-white shadow-[0_8px_18px_rgba(11,23,51,0.22)]">
                  <QrCode className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Scan to pay</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Scan a receive ɃU QR or a vendor pay QR
                  </p>
                </div>
              </div>
              {cameraActive && step === 'search' ? (
                <TicketQrScanner
                  readerId="bu-send-pay-reader"
                  active={cameraActive}
                  onScan={handlePayScan}
                />
              ) : null}
              <Button
                type="button"
                className="bu-press h-11 w-full rounded-2xl bg-neutral-950 font-semibold text-white shadow-[0_12px_28px_rgba(11,23,51,0.22)] hover:bg-neutral-900"
                onClick={() => {
                  setMessage(null)
                  setCameraActive((open) => !open)
                }}
              >
                {cameraActive && step === 'search' ? 'Stop scanner' : 'Scan to pay'}
              </Button>
              {cameraActive && step === 'search' ? (
                <>
                  <Input
                    placeholder="Or paste QR payload"
                    value={pastedQr}
                    onChange={(e) => setPastedQr(e.target.value)}
                    className="h-11 rounded-2xl border-white/70 bg-white/55"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full rounded-2xl"
                    onClick={() => handlePayScan(pastedQr)}
                  >
                    Load from paste
                  </Button>
                </>
              ) : null}
            </div>

            {message && step === 'search' && (
              <p className="mt-3 text-sm text-destructive">{message}</p>
            )}

            {searchQuery.replace(/[^\d]/g, '').length >= 10 && (
              <div className="mt-4 space-y-2">
                {lookingUp ? (
                  <div className="bu-glass-soft rounded-2xl px-5 py-8 text-center">
                    <p className="text-sm text-muted-foreground">Looking up that account…</p>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="bu-glass-soft rounded-2xl px-5 py-8 text-center">
                    <p className="text-sm text-muted-foreground">No matching account</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Use the full phone number for their ɃU account.
                    </p>
                  </div>
                ) : (
                  searchResults.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleSelectUser(user)}
                      className="bu-press bu-glass-soft flex w-full items-center justify-between gap-3 rounded-2xl px-3.5 py-3 text-left"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-950 text-white">
                          <User className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-sm font-semibold">{user.fullName}</h3>
                            {user.verified ? <span className="text-xs text-emerald-500">✓</span> : null}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{user.username}</p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white">
                        Select
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}

            {searchQuery.replace(/[^\d]/g, '').length < 10 && (
              <div className="mt-5">
                <div className="bu-glass mb-3 grid grid-cols-2 rounded-[20px] p-1">
                  <button
                    type="button"
                    onClick={() => setPartyTab('beneficiaries')}
                    className={`rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                      partyTab === 'beneficiaries'
                        ? 'bg-neutral-950 text-white shadow-[0_8px_18px_rgba(11,23,51,0.2)]'
                        : 'text-neutral-500'
                    }`}
                  >
                    Beneficiaries
                  </button>
                  <button
                    type="button"
                    onClick={() => setPartyTab('favorites')}
                    className={`rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                      partyTab === 'favorites'
                        ? 'bg-neutral-950 text-white shadow-[0_8px_18px_rgba(11,23,51,0.2)]'
                        : 'text-neutral-500'
                    }`}
                  >
                    Favorites
                  </button>
                </div>

                {partyTab === 'beneficiaries' ? (
                  <div>
                    <div className="mb-2.5 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">Recent people</p>
                      <button
                        type="button"
                        onClick={() => setStep('history')}
                        className="bu-glass-soft rounded-full px-3 py-1 text-xs font-semibold text-neutral-700"
                      >
                        View all
                      </button>
                    </div>
                    {beneficiaries.length === 0 ? (
                      <div className="bu-glass-soft rounded-2xl px-4 py-5 text-sm text-muted-foreground">
                        People you send ɃU to will show up here.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {beneficiaries.slice(0, 6).map((party) => (
                          <div key={party.id} className="bu-glass-soft rounded-2xl px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <button
                                type="button"
                                onClick={() => void openSavedParty(party)}
                                className="bu-press flex min-w-0 flex-1 items-center gap-3 text-left"
                              >
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-950/5 text-neutral-700">
                                  <User className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold">{party.fullName}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {party.lastAmount
                                      ? `Last sent Ƀ ${formatBu(party.lastAmount)}`
                                      : party.username}
                                  </p>
                                </div>
                              </button>
                              <button
                                type="button"
                                aria-label={isFavorite(party.id) ? 'Remove favorite' : 'Add favorite'}
                                onClick={() => toggleFavorite(party)}
                                className={`rounded-full p-2 ${isFavorite(party.id) ? 'text-amber-500' : 'text-neutral-400'}`}
                              >
                                <Star className={`h-4 w-4 ${isFavorite(party.id) ? 'fill-current' : ''}`} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {favorites.length === 0 ? (
                      <div className="bu-glass-soft rounded-2xl px-4 py-5 text-sm text-muted-foreground">
                        No favorites yet. Star a beneficiary to add them.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {favorites.map((party) => (
                          <div key={party.id} className="bu-glass-soft rounded-2xl px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <button
                                type="button"
                                onClick={() => void openSavedParty(party)}
                                className="bu-press flex min-w-0 flex-1 items-center gap-3 text-left"
                              >
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                  <Star className="h-4 w-4 fill-current" />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold">{party.fullName}</p>
                                  <p className="truncate text-xs text-muted-foreground">{party.username}</p>
                                </div>
                              </button>
                              <button
                                type="button"
                                aria-label="Remove favorite"
                                onClick={() => toggleFavorite(party)}
                                className="rounded-full p-2 text-amber-500"
                              >
                                <Star className="h-4 w-4 fill-current" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {step === 'confirm' && selectedUser && (
        <>
          <div className="px-4">
            <div className="mb-4">
              <Button
                onClick={() => {
                  setStep('search')
                  setSelectedUser(null)
                  setTransferForm({ amount: '', message: '' })
                }}
                variant="outline"
                className="w-full"
              >
                ← Back to Search
              </Button>
            </div>

            <h2 className="text-xl font-bold mb-4">Send ɃU to User</h2>

            {/* Selected User Info */}
            <Card className="border-primary/20 bg-card p-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                  <User className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{selectedUser.fullName}</h3>
                    {selectedUser.verified && (
                      <span className="rounded-full bg-green-400/20 px-2 py-1 text-xs text-green-400">
                        Verified
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={isFavorite(selectedUser.id) ? 'Remove favorite' : 'Add favorite'}
                      onClick={() =>
                        toggleFavorite({
                          id: selectedUser.id,
                          username: selectedUser.username,
                          fullName: selectedUser.fullName,
                        })
                      }
                      className={`rounded-full p-1 ${isFavorite(selectedUser.id) ? 'text-amber-500' : 'text-neutral-400'}`}
                    >
                      <Star className={`h-4 w-4 ${isFavorite(selectedUser.id) ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{selectedUser.username}</p>
                </div>
              </div>
            </Card>

            {/* Transfer Form */}
            <Card className="border-primary/20 space-y-4 bg-card p-6">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold">Amount (Ƀ)</label>
                  <Input
                    type="number"
                    min={BU_MIN_TRANSFER}
                    step="1"
                    placeholder="Enter ɃU amount"
                    value={transferForm.amount}
                    onChange={(e) =>
                      setTransferForm({ ...transferForm, amount: e.target.value })
                    }
                    className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {BU_SPRAY_NOTES.map((note) => (
                      <Button
                        key={note}
                        type="button"
                        size="sm"
                        variant={transferForm.amount === String(note) ? 'default' : 'outline'}
                        onClick={() => setTransferForm({ ...transferForm, amount: String(note) })}
                      >
                        Ƀ {note.toLocaleString('en-NG')}
                      </Button>
                    ))}
                  </div>
                  {transferForm.amount && !isNaN(Number(transferForm.amount)) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Equivalent: ₦{formatNairaPlain(nairaFromBu(Number(transferForm.amount)))}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-semibold">Message (Optional)</label>
                  <Input
                    placeholder="Add a message"
                    value={transferForm.message}
                    onChange={(e) =>
                      setTransferForm({ ...transferForm, message: e.target.value })
                    }
                    className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                {message && <p className="text-sm text-destructive">{message}</p>}
                <Button
                  onClick={openTransferPin}
                  disabled={
                    busy ||
                    !transferForm.amount ||
                    Number.isNaN(Number(transferForm.amount)) ||
                    Number(transferForm.amount) + 1e-9 < BU_MIN_TRANSFER
                  }
                  className="w-full bg-primary py-3 text-primary-foreground hover:bg-primary/90"
                >
                  {busy ? 'Sending…' : 'Send ɃU Now'}
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}

      {step === 'success' && transfers.length > 0 && (
        <>
          <div className="px-4">
            <Card className={`${transfers[0].type === 'tip' ? 'border-yellow-400/30 bg-yellow-400/10' : 'border-green-400/30 bg-green-400/10'} p-6 mb-4`}>
              <div className="flex items-start gap-3">
                <CheckCircle className={`h-6 w-6 ${transfers[0].type === 'tip' ? 'text-yellow-400' : 'text-green-400'} flex-shrink-0 mt-0.5`} />
                <div className="flex-1">
                  <h3 className={`font-semibold mb-2 ${transfers[0].type === 'tip' ? 'text-yellow-400' : 'text-green-400'}`}>
                    {transfers[0].type === 'tip' ? 'Tip Sent Instantly!' : 'ɃU Sent Successfully!'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {transfers[0].type === 'tip' 
                      ? 'Your tip has been transferred instantly to the recipient\'s wallet. No cash needed!'
                      : 'Your ɃU has been transferred to the recipient\'s wallet.'}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="border-primary/20 bg-card p-4 mb-4">
              <h4 className="font-semibold mb-3">Transfer Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recipient:</span>
                  <span className="font-semibold">{transfers[0].recipientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Username:</span>
                  <span className="font-semibold">{transfers[0].recipientUsername}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className={`font-semibold ${transfers[0].type === 'tip' ? 'text-yellow-400' : 'text-primary'}`}>
                    {transfers[0].type === 'tip' ? 'Tip' : 'Transfer'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-bold text-red-500">-Ƀ {formatBu(transfers[0].amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="text-green-400">Completed</span>
                </div>
                {transfers[0].message && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-muted-foreground">Message:</p>
                    <p className="font-medium">"{transfers[0].message}"</p>
                  </div>
                )}
              </div>
            </Card>

            <div className="mb-4">
              <BuInvoiceActions invoice={transfers[0].invoice} />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setStep(homeStep)
                  setSelectedUser(null)
                  setTransferForm({ amount: '', message: '' })
                  setTipAmount('')
                  setScannedQRData(null)
                  setTransferType(initialIntent === 'tip' ? 'tip' : 'transfer')
                }}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Send More ɃU
              </Button>
              <Button
                onClick={() => setStep('history')}
                variant="outline"
                className="flex-1"
              >
                Beneficiaries
              </Button>
            </div>
          </div>
        </>
      )}

      {step === 'history' && (
        <>
          <div className="px-4">
            <div className="mb-4">
              <Button
                onClick={() => setStep(homeStep)}
                variant="outline"
                className="w-full"
              >
                ← Back
              </Button>
            </div>

            <h2 className="text-xl font-bold mb-1">Beneficiaries</h2>
            <p className="mb-4 text-sm text-neutral-500">Tap a beneficiary to select them and send ɃU.</p>

            <div className="space-y-3">
              {beneficiaries.length === 0 ? (
                <Card className="border-border/50 bg-card/50 p-8 text-center">
                  <p className="text-muted-foreground">No beneficiaries yet</p>
                  <Button
                    onClick={() => setStep(homeStep)}
                    className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Send ɃU
                  </Button>
                </Card>
              ) : (
                beneficiaries.map((party) => (
                  <Card key={party.id} className="border-neutral-200 bg-white p-4 transition hover:border-neutral-400">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => void openSavedParty(party)}
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
                          <User className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold">{party.fullName}</h3>
                          <p className="truncate text-sm text-muted-foreground">{party.username}</p>
                          {party.lastAmount ? (
                            <p className="mt-1 text-sm font-medium text-neutral-700">
                              Last sent Ƀ {formatBu(party.lastAmount)}
                              <span className="font-normal text-muted-foreground">
                                {' '}
                                · ₦{formatNairaPlain(nairaFromBu(party.lastAmount))}
                              </span>
                            </p>
                          ) : null}
                        </div>
                      </button>
                      <button
                        type="button"
                        aria-label={isFavorite(party.id) ? 'Remove favorite' : 'Add favorite'}
                        onClick={() => toggleFavorite(party)}
                        className={`rounded-full p-2 ${isFavorite(party.id) ? 'text-amber-500' : 'text-neutral-400'}`}
                      >
                        <Star className={`h-4 w-4 ${isFavorite(party.id) ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        </>
      )}

      <PinPadModal
        open={pinOpen}
        busy={busy}
        error={pinError}
        onClose={() => {
          if (busy) return
          setPinOpen(false)
          setPinAction(null)
          setPinError(null)
          setTxPin('')
        }}
        onSubmit={handlePinSubmit}
      />
    </div>
  )
}
