'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { QrCode, CheckCircle, Calendar, MapPin, User, AlertCircle } from 'lucide-react'
import { TicketQrScanner } from '@/components/web/ticket-qr-scanner'
import { formatEventDateTime } from '@/lib/datetime'
import {
  BU_MIN_SPRAY,
  BU_SPRAY_NOTES,
  formatBu,
  formatNairaPlain,
  nairaFromBu,
  quotePeerMoveBu,
} from '@/lib/bu-rate'
import { useAccount } from '@/components/account-store'
import { BuInvoiceActions } from '@/components/bu-invoice'
import { invoiceNumberFromId, type BuInvoice } from '@/lib/invoice/document'

interface EventDetails {
  eventId: string
  eventName: string
  celebrantName: string
  celebrantWalletId: string
  eventDate: string
  location?: string
  vendorName: string
}

interface BUTransfer {
  id: string
  eventId: string
  eventName: string
  celebrantName: string
  amount: number
  message: string
  date: string
  status: 'completed' | 'pending'
  invoice: BuInvoice
}

function eventFromPayload(data: Record<string, unknown>): EventDetails | null {
  const eventId = String(data.id ?? data.eventId ?? data.event_id ?? '')
  if (!eventId) return null
  return {
    eventId,
    eventName: String(data.title ?? data.name ?? data.eventName ?? 'Event'),
    celebrantName: String(data.celebrant_name ?? data.organizer_name ?? data.celebrantName ?? 'Celebrant'),
    celebrantWalletId: String(data.organizer_id ?? data.celebrant_id ?? data.celebrantWalletId ?? ''),
    eventDate: data.start_time
      ? formatEventDateTime(String(data.start_time))
      : String(data.eventDate ?? ''),
    location: String(data.venue_name ?? data.venue_address ?? data.location ?? '') || undefined,
    vendorName: String(data.venue_name ?? data.vendorName ?? ''),
  }
}

export default function SprayingQR() {
  const { applySpendBu, refreshWallet, displayName } = useAccount()
  const [mode, setMode] = useState<'scan' | 'details' | 'send-bu' | 'confirmation'>('scan')
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [pasted, setPasted] = useState('')
  const [transfers, setTransfers] = useState<BUTransfer[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sprayForm, setSprayForm] = useState({
    amount: '',
    message: '',
  })
  const [txPin, setTxPin] = useState('')

  async function loadEvent(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return
    setMessage(null)
    let eventId = trimmed
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      const fromJson = eventFromPayload(parsed)
      if (fromJson?.eventId) eventId = fromJson.eventId
    } catch {
      eventId = trimmed
    }
    const res = await fetch(`/api/events/slug/${encodeURIComponent(eventId)}`, { credentials: 'include' })
    const json = await res.json()
    if (!json.status || !json.data) {
      setMessage(json.message ?? 'This QR is not a live ɃU event.')
      return
    }
    const details = eventFromPayload(json.data as Record<string, unknown>)
    if (!details) {
      setMessage('Could not read this event.')
      return
    }
    setEventDetails(details)
    setMode('details')
    setCameraActive(false)
  }

  async function handleSendBU() {
    if (!eventDetails || !sprayForm.amount || Number(sprayForm.amount) <= 0) return
    if (Number(sprayForm.amount) + 1e-9 < BU_MIN_SPRAY) {
      setMessage(`Minimum spray is ${BU_MIN_SPRAY.toLocaleString('en-NG')} ɃU`)
      return
    }
    if (!eventDetails.celebrantWalletId) {
      setMessage('This event has no celebrant wallet to receive ɃU.')
      return
    }
    if (!/^\d{4,6}$/.test(txPin)) {
      setMessage('Enter your transaction PIN. You created it when you registered.')
      return
    }
    setBusy(true)
    setMessage(null)
    applySpendBu(quotePeerMoveBu(Number(sprayForm.amount), 'spray').totalDebitBu, { refresh: false })
    try {
      const res = await fetch('/api/wallet/transfer', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_user_id: eventDetails.celebrantWalletId,
          amount: Number(sprayForm.amount),
          event_id: eventDetails.eventId,
          note: sprayForm.message,
          pin: txPin,
        }),
      })
      const json = await res.json()
      setBusy(false)
      if (!json.status) {
        void refreshWallet()
        setMessage(json.message ?? 'Transfer failed.')
        return
      }
      void refreshWallet()
      const data = (json.data ?? {}) as Record<string, unknown>
      const moveId = String(data.invoice_number || Date.now())
      const amount = Number(sprayForm.amount)
      setTransfers([
        {
          id: moveId,
          eventId: eventDetails.eventId,
          eventName: eventDetails.eventName,
          celebrantName: eventDetails.celebrantName,
          amount,
          message: sprayForm.message,
          date: new Date().toISOString(),
          status: 'completed',
          invoice: {
            number: invoiceNumberFromId(moveId),
            issuedAt: new Date().toISOString(),
            kind: 'spray',
            fromName: String(data.from_name || displayName || 'You'),
            toName: String(data.to_name || eventDetails.celebrantName),
            toId: eventDetails.eventName,
            amountBu: amount,
            amountNaira: nairaFromBu(amount),
            note: sprayForm.message || undefined,
            status: 'Paid',
          },
        },
        ...transfers,
      ])
      setSprayForm({ amount: '', message: '' })
      setTxPin('')
      setMode('confirmation')
    } catch {
      setBusy(false)
      void refreshWallet()
      setMessage('Could not reach ɃU.')
    }
  }

  const brandGradient = 'linear-gradient(120deg, #2f7bff 0%, #8b5cf6 55%, #ff2d95 120%)'

  return (
    <div className="space-y-6 pb-28 pt-2">
      {mode === 'scan' && (
        <div className="space-y-4 px-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b5cf6]" data-spray-ui="v2">
              Live spray
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[color:var(--bu-navy)]">
              Scan Event QR Code
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">
              Scan the live event QR, or paste the event ID, to send ɃU to the celebrant.
            </p>
          </div>

          <div
            className="overflow-hidden rounded-[28px] p-5"
            style={{
              background: 'linear-gradient(180deg, #ffffff 0%, #f7f9ff 100%)',
              border: '1px solid rgba(47,123,255,0.16)',
              boxShadow:
                '0 18px 40px rgba(47,123,255,0.1), inset 0 1px 0 rgba(255,255,255,1)',
            }}
          >
            {!cameraActive ? (
              <div className="space-y-4">
                <div
                  className="relative mx-auto flex aspect-square w-full max-w-[220px] items-center justify-center overflow-hidden rounded-[24px]"
                  style={{
                    background:
                      'radial-gradient(circle at 30% 20%, rgba(34,224,255,0.18), transparent 55%), radial-gradient(circle at 80% 80%, rgba(255,45,149,0.14), transparent 50%), linear-gradient(160deg, #eef3ff, #f8f5ff)',
                    border: '1.5px dashed rgba(47,123,255,0.35)',
                  }}
                >
                  <div
                    className="absolute inset-3 rounded-[18px]"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(47,123,255,0.08), rgba(139,92,246,0.08))',
                    }}
                  />
                  <QrCode className="relative h-20 w-20 text-[#2f7bff]/70" strokeWidth={1.5} />
                </div>

                <button
                  type="button"
                  onClick={() => setCameraActive(true)}
                  className="bu-press flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold text-white"
                  style={{
                    background: brandGradient,
                    boxShadow: '0 14px 28px rgba(47,123,255,0.32)',
                  }}
                >
                  Start QR Scanner
                </button>

                <div className="relative flex items-center gap-3 py-0.5">
                  <div className="h-px flex-1 bg-neutral-200/80" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                    or paste
                  </span>
                  <div className="h-px flex-1 bg-neutral-200/80" />
                </div>

                <Input
                  placeholder="Paste event ID or QR payload"
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  className="h-12 rounded-2xl border-white/70 bg-white/70 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] placeholder:text-muted-foreground focus-visible:border-[#2f7bff]/40 focus-visible:ring-[#2f7bff]/20"
                />
                <button
                  type="button"
                  onClick={() => void loadEvent(pasted)}
                  className="bu-press flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold text-[color:var(--bu-navy)]"
                  style={{
                    background: 'rgba(255,255,255,0.9)',
                    border: '1px solid rgba(47,123,255,0.2)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,1)',
                  }}
                >
                  Load event
                </button>
                {message ? <p className="text-sm text-destructive">{message}</p> : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-hidden rounded-2xl ring-1 ring-[#2f7bff]/25">
                  <TicketQrScanner
                    readerId="bu-spray-reader"
                    active={cameraActive}
                    onScan={(text) => void loadEvent(text)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setCameraActive(false)}
                  className="bu-press flex h-11 w-full items-center justify-center rounded-2xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-700"
                >
                  Cancel scanner
                </button>
                {message ? <p className="text-sm text-destructive">{message}</p> : null}
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'details' && eventDetails && (
        <>
          <div className="px-4">
            <div className="mb-4">
              <Button
                onClick={() => {
                  setMode('scan')
                  setEventDetails(null)
                  setMessage(null)
                }}
                variant="outline"
                className="w-full"
              >
                ← Scan Different QR
              </Button>
            </div>

            <Card className="border-green-400/30 bg-green-400/10 p-4 mb-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-green-400 mb-1">Event loaded</h3>
                  <p className="text-sm text-muted-foreground">
                    Send ɃU to the celebrant from your live wallet.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="border-primary/20 bg-card p-6 mb-4">
              <h3 className="font-semibold mb-4">Event Details</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Event Name</p>
                    <p className="font-semibold">{eventDetails.eventName}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <User className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Celebrant</p>
                    <p className="font-semibold">{eventDetails.celebrantName}</p>
                  </div>
                </div>
                {eventDetails.location && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Location</p>
                      <p className="font-semibold">{eventDetails.location}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Date</p>
                    <p className="font-semibold">{eventDetails.eventDate}</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="border-primary/20 space-y-4 bg-card p-6">
              <h3 className="font-semibold">Send ɃU to Celebrant</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold">Amount (Ƀ)</label>
                  <Input
                    type="number"
                    min={BU_MIN_SPRAY}
                    step="1"
                    placeholder={`Minimum ${BU_MIN_SPRAY.toLocaleString('en-NG')} ɃU`}
                    value={sprayForm.amount}
                    onChange={(e) => setSprayForm({ ...sprayForm, amount: e.target.value })}
                    className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {BU_SPRAY_NOTES.map((note) => (
                      <Button
                        key={note}
                        type="button"
                        size="sm"
                        variant={sprayForm.amount === String(note) ? 'default' : 'outline'}
                        onClick={() => setSprayForm({ ...sprayForm, amount: String(note) })}
                      >
                        Ƀ {note.toLocaleString('en-NG')}
                      </Button>
                    ))}
                  </div>
                  {sprayForm.amount && !isNaN(Number(sprayForm.amount)) && Number(sprayForm.amount) > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Equivalent: ₦{formatNairaPlain(nairaFromBu(Number(sprayForm.amount)))}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-semibold">Message (Optional)</label>
                  <Input
                    placeholder="Add a congratulatory message"
                    value={sprayForm.message}
                    onChange={(e) => setSprayForm({ ...sprayForm, message: e.target.value })}
                    className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold">Transaction PIN</label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="PIN you created at signup"
                    value={txPin}
                    onChange={(e) => setTxPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                {message && <p className="text-sm text-destructive">{message}</p>}
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      ɃU is transferred 1:1 (1 ɃU = ₦1) from your wallet to {eventDetails.celebrantName}. Physical Bison Notes have zero monetary value.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => void handleSendBU()}
                  disabled={
                    busy ||
                    !sprayForm.amount ||
                    Number.isNaN(Number(sprayForm.amount)) ||
                    Number(sprayForm.amount) + 1e-9 < BU_MIN_SPRAY ||
                    !/^\d{4,6}$/.test(txPin)
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

      {mode === 'confirmation' && transfers.length > 0 && (
        <>
          <div className="px-4">
            <Card className="border-green-400/30 bg-green-400/10 p-6 mb-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-green-400 mb-2">ɃU Transfer Successful!</h3>
                  <p className="text-sm text-muted-foreground">
                    Your ɃU has been transferred to the celebrant&apos;s wallet.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="border-primary/20 bg-card p-4 mb-4">
              <h4 className="font-semibold mb-3">Transfer Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Event:</span>
                  <span className="font-semibold">{transfers[0].eventName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Celebrant:</span>
                  <span className="font-semibold">{transfers[0].celebrantName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-bold text-primary">Ƀ {formatBu(transfers[0].amount)}</span>
                </div>
              </div>
            </Card>

            <div className="mb-4">
              <BuInvoiceActions invoice={transfers[0].invoice} />
            </div>

            <Button
              onClick={() => {
                setMode('scan')
                setEventDetails(null)
                setSprayForm({ amount: '', message: '' })
              }}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Scan Another QR Code
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
