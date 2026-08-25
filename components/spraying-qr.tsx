'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { QrCode, CheckCircle, Calendar, MapPin, User, AlertCircle } from 'lucide-react'
import { TicketQrScanner } from '@/components/web/ticket-qr-scanner'

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
      ? new Date(String(data.start_time)).toLocaleString()
      : String(data.eventDate ?? ''),
    location: String(data.venue_name ?? data.venue_address ?? data.location ?? '') || undefined,
    vendorName: String(data.venue_name ?? data.vendorName ?? ''),
  }
}

export default function SprayingQR() {
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
    if (!eventDetails.celebrantWalletId) {
      setMessage('This event has no celebrant wallet to receive ɃU.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/wallet/transfer', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_user_id: eventDetails.celebrantWalletId,
          amount: Number(sprayForm.amount),
          event_id: eventDetails.eventId,
        }),
      })
      const json = await res.json()
      setBusy(false)
      if (!json.status) {
        setMessage(json.message ?? 'Transfer failed.')
        return
      }
      setTransfers([
        {
          id: eventDetails.eventId,
          eventId: eventDetails.eventId,
          eventName: eventDetails.eventName,
          celebrantName: eventDetails.celebrantName,
          amount: Number(sprayForm.amount),
          message: sprayForm.message,
          date: new Date().toISOString(),
          status: 'completed',
        },
        ...transfers,
      ])
      setSprayForm({ amount: '', message: '' })
      setMode('confirmation')
    } catch {
      setBusy(false)
      setMessage('Could not reach ɃU.')
    }
  }

  return (
    <div className="space-y-6 pb-24 pt-4">
      {mode === 'scan' && (
        <>
          <div className="px-4">
            <h2 className="text-xl font-bold mb-4">Scan Event QR Code</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Scan the live event QR, or paste the event ID, to send ɃU to the celebrant.
            </p>

            <Card className="border-primary/20 bg-card p-6 mb-4">
              {!cameraActive ? (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <div className="rounded-lg bg-foreground/5 p-8 border-2 border-dashed border-primary/30">
                      <QrCode className="h-24 w-24 text-primary/50 mx-auto" />
                    </div>
                  </div>
                  <Button
                    onClick={() => setCameraActive(true)}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Start QR Scanner
                  </Button>
                  <Input
                    placeholder="Paste event ID or QR payload"
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    className="bg-secondary text-foreground placeholder:text-muted-foreground"
                  />
                  <Button variant="outline" className="w-full" onClick={() => void loadEvent(pasted)}>
                    Load event
                  </Button>
                  {message && <p className="text-sm text-destructive">{message}</p>}
                </div>
              ) : (
                <div className="space-y-4">
                  <TicketQrScanner
                    readerId="bu-spray-reader"
                    active={cameraActive}
                    onScan={(text) => void loadEvent(text)}
                  />
                  <Button onClick={() => setCameraActive(false)} variant="outline" className="w-full">
                    Cancel scanner
                  </Button>
                  {message && <p className="text-sm text-destructive">{message}</p>}
                </div>
              )}
            </Card>
          </div>
        </>
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
                    placeholder="Enter ɃU amount"
                    value={sprayForm.amount}
                    onChange={(e) => setSprayForm({ ...sprayForm, amount: e.target.value })}
                    className="mt-2 bg-secondary text-foreground placeholder:text-muted-foreground"
                  />
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
                {message && <p className="text-sm text-destructive">{message}</p>}
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      ɃU is transferred from your wallet to {eventDetails.celebrantName}. Physical Bison Notes have zero monetary value.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => void handleSendBU()}
                  disabled={busy}
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
                  <span className="font-bold text-primary">Ƀ {transfers[0].amount.toLocaleString()}</span>
                </div>
              </div>
            </Card>

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
