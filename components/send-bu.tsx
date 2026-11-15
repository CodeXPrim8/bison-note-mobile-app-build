'use client'

import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { User, CheckCircle, AlertCircle, Search, QrCode, Sparkles, Star } from 'lucide-react'
import { TicketQrScanner } from '@/components/web/ticket-qr-scanner'
import { formatEventDateTime } from '@/lib/datetime'
import { BU_MIN_SPRAY, BU_MIN_TRANSFER, BU_SPRAY_NOTES, buFromNaira, formatBu, formatNairaPlain, nairaFromBu } from '@/lib/bu-rate'
import { useAccount } from '@/components/account-store'
import { WalletPageSummary } from '@/components/wallet-summary'
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

export default function SendBU({ initialIntent }: { initialIntent?: 'tip' | 'transfer' } = {}) {
  const { applySpendBu, refreshWallet, userId, displayName } = useAccount()
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
    fetch('/api/wallet', { credentials: 'include' })
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
        try {
          const res = await fetch('/api/users/lookup', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bu_id: query.trim() }),
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
        } catch {
          if (seq !== lookupSeq.current) return
          setLookingUp(false)
          setSearchResults([])
          setMessage('Could not look up that ɃU ID')
        }
      })()
    }, 280)
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
    applySpendBu(amount, { refresh: false })
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

  const handleTipScan = (raw: string) => {
    const parsed = parseReceiveQr(raw)
    if (!parsed) {
      setMessage('Scan a live receive-ɃU QR, or paste the payload.')
      return
    }
    if (isSelfAccount(parsed.userId)) {
      setMessage('That’s your own QR. You can’t tip yourself.')
      setCameraActive(false)
      return
    }
    setScannedQRData(parsed)
    setStep('tip-confirm')
    setCameraActive(false)
    setMessage(null)
  }


  return (
    <div className="space-y-6 bg-transparent pb-28 pt-4 text-neutral-950">
      {step === 'tip-scan' && (
        <>
          <div className="px-4">
            {initialIntent !== 'tip' ? (
              <div className="mb-4">
                <Button
                  onClick={() => setStep('search')}
                  variant="outline"
                  className="w-full"
                >
                  ← Back
                </Button>
              </div>
            ) : null}
            <h2 className="text-xl font-bold mb-4">Give Tip</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Scan the recipient's QR code to send a tip instantly. Perfect for performers, and gifters - digital instead of cash!
            </p>

            <Card className="border-yellow-400/20 bg-yellow-400/5 p-6 mb-4 space-y-4">
              {cameraActive ? (
                <TicketQrScanner
                  readerId="bu-tip-reader"
                  active={cameraActive}
                  onScan={handleTipScan}
                />
              ) : (
                <div className="flex flex-col items-center">
                  <QrCode className="h-24 w-24 text-yellow-400/30 mb-3" />
                  <p className="text-xs text-muted-foreground mb-3">Point the camera at a live receive-ɃU QR</p>
                </div>
              )}
              <Button
                onClick={() => setCameraActive((open) => !open)}
                className="w-full bg-yellow-400 text-yellow-900 hover:bg-yellow-400/90"
              >
                {cameraActive ? 'Stop scanner' : 'Scan QR Code'}
              </Button>
              <Input
                placeholder="Or paste receive QR payload"
                value={pastedQr}
                onChange={(e) => setPastedQr(e.target.value)}
                className="bg-secondary text-foreground placeholder:text-muted-foreground"
              />
              <Button variant="outline" className="w-full" onClick={() => handleTipScan(pastedQr)}>
                Load recipient
              </Button>
              {message && <p className="text-sm text-destructive">{message}</p>}
            </Card>

            <Card className="border-border/50 bg-card/50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-semibold mb-1">How it works:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>You enter tip amount</li>
                    <li>Recipient shows their QR code</li>
                    <li>Tip is sent instantly</li>
                  </ul>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      {step === 'tip-confirm' && scannedQRData && (
        <>
          <div className="px-4">
            <div className="mb-4">
              <Button
                onClick={() => {
                  setStep('tip-scan')
                  setScannedQRData(null)
                  setTipAmount('')
                }}
                variant="outline"
                className="w-full"
              >
                ← Back
              </Button>
            </div>

            <h2 className="text-xl font-bold mb-4">Confirm Tip</h2>

            <Card className="border-yellow-400/20 bg-yellow-400/5 p-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-400/20">
                  <Sparkles className="h-8 w-8 text-yellow-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{scannedQRData.username}</h3>
                  <p className="text-sm text-muted-foreground mt-1">QR Code scanned successfully</p>
                </div>
              </div>
            </Card>

            <Card className="border-primary/20 space-y-4 bg-card p-6">
              <div>
                <label className="text-sm font-semibold">Tip Amount (Ƀ)</label>
                <Input
                  type="number"
                  min={BU_MIN_SPRAY}
                  step="1"
                  placeholder={`Minimum ${BU_MIN_SPRAY.toLocaleString('en-NG')} ɃU`}
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {BU_SPRAY_NOTES.map((note) => (
                    <Button
                      key={note}
                      type="button"
                      size="sm"
                      variant={tipAmount === String(note) ? 'default' : 'outline'}
                      onClick={() => setTipAmount(String(note))}
                    >
                      Ƀ {note.toLocaleString('en-NG')}
                    </Button>
                  ))}
                </div>
                {tipAmount && !isNaN(Number(tipAmount)) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Equivalent: ₦{formatNairaPlain(nairaFromBu(Number(tipAmount)))}
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-yellow-400/20 bg-yellow-400/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Tip will be sent instantly to {scannedQRData.username}'s wallet. This is a peer-to-peer tip transfer.
                  </p>
                </div>
              </div>

              {message && <p className="text-sm text-destructive">{message}</p>}
              <Button
                onClick={openTipPin}
                disabled={busy || !tipAmount || isNaN(Number(tipAmount)) || Number(tipAmount) + 1e-9 < BU_MIN_SPRAY}
                className="w-full bg-yellow-400 py-3 text-yellow-900 hover:bg-yellow-400/90"
              >
                {busy ? 'Sending…' : 'Give Tip'}
              </Button>
            </Card>
          </div>
        </>
      )}

      {step === 'search' && (
        <>
          <div className="px-4">
            <WalletPageSummary
              kicker=""
              title="Send ɃU"
              detail="Enter the account number and confirm the name of the person you want to send ɃU to."
            />
            <h2 className="sr-only">Send ɃU</h2>

            <div className="mt-5 rounded-[24px] border-2 border-neutral-950 bg-neutral-50 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
              <label htmlFor="bu-account-number" className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-neutral-600">
                Account number
              </label>
              <div className="flex items-center gap-3 rounded-2xl border border-neutral-300 bg-white px-4 py-3 focus-within:border-neutral-950 focus-within:ring-2 focus-within:ring-neutral-950/15">
                <Search className="h-5 w-5 shrink-0 text-neutral-950" />
                <Input
                  id="bu-account-number"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder=""
                  value={searchQuery}
                  onChange={(e) => void handleSearch(e.target.value)}
                  className="h-auto border-0 bg-transparent px-0 text-base font-medium text-neutral-950 shadow-none placeholder:text-neutral-400 focus-visible:ring-0"
                />
              </div>
            </div>
            {message && step === 'search' && (
              <p className="mt-3 text-sm text-destructive">{message}</p>
            )}

            {searchQuery.replace(/[^\d]/g, '').length >= 10 && (
              <div className="mt-5 space-y-2">
                {lookingUp ? (
                  <Card className="border-border/50 bg-card/50 p-8 text-center">
                    <p className="text-muted-foreground">Looking up that account number…</p>
                  </Card>
                ) : searchResults.length === 0 ? (
                  <Card className="border-border/50 bg-card/50 p-8 text-center">
                    <p className="text-muted-foreground">No matching account</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Enter the full phone number used as their ɃU account number.
                    </p>
                  </Card>
                ) : (
                  searchResults.map((user) => (
                    <Card
                      key={user.id}
                      onClick={() => handleSelectUser(user)}
                      className="cursor-pointer border-neutral-200 bg-white p-4 transition hover:border-neutral-400"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-950 text-white">
                            <User className="h-6 w-6" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="truncate font-semibold">{user.fullName}</h3>
                              {user.verified && <span className="text-xs text-green-500">✓</span>}
                            </div>
                            <p className="text-sm text-muted-foreground">{user.username}</p>
                          </div>
                        </div>
                        <Button size="sm" className="shrink-0 bg-neutral-950 text-white hover:bg-neutral-800">
                          Select
                        </Button>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            )}

            {searchQuery.replace(/[^\d]/g, '').length < 10 && (
              <div className="mt-6">
                <div className="mb-4 grid grid-cols-2 rounded-2xl bg-neutral-100 p-1">
                  <button
                    type="button"
                    onClick={() => setPartyTab('beneficiaries')}
                    className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      partyTab === 'beneficiaries'
                        ? 'bg-white text-neutral-950 shadow-sm'
                        : 'text-neutral-500'
                    }`}
                  >
                    Beneficiaries
                  </button>
                  <button
                    type="button"
                    onClick={() => setPartyTab('favorites')}
                    className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      partyTab === 'favorites'
                        ? 'bg-white text-neutral-950 shadow-sm'
                        : 'text-neutral-500'
                    }`}
                  >
                    Favorites
                  </button>
                </div>

                {partyTab === 'beneficiaries' ? (
                  <div>
                    <div className="mb-3 flex items-center justify-end">
                      <Button onClick={() => setStep('history')} variant="outline" size="sm">
                        View All
                      </Button>
                    </div>
                    {beneficiaries.length === 0 ? (
                      <p className="rounded-2xl bg-neutral-100 px-4 py-5 text-sm text-neutral-500">
                        People you send ɃU to will show up here.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {beneficiaries.slice(0, 6).map((party) => (
                          <Card key={party.id} className="border-neutral-200 bg-white p-3">
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => void openSavedParty(party)}
                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                              >
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
                                  <User className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{party.fullName}</p>
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
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {favorites.length === 0 ? (
                      <p className="rounded-2xl bg-neutral-100 px-4 py-5 text-sm text-neutral-500">
                        No favorites yet. Star a beneficiary to add them.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {favorites.map((party) => (
                          <Card key={party.id} className="border-neutral-200 bg-white p-3">
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => void openSavedParty(party)}
                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                              >
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                  <Star className="h-4 w-4 fill-current" />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{party.fullName}</p>
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
                          </Card>
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
