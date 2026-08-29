'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { TicketQrScanner } from '@/components/web/ticket-qr-scanner'
import { formatEventDateTime } from '@/lib/datetime'

interface TransferValidation {
  id: string
  transferId: string
  eventId: string
  eventName: string
  guestName: string
  amount: number
  status: 'valid' | 'invalid' | 'duplicate' | 'not_found'
  timestamp: string
  message: string
}

export default function QRScanner() {
  const [mode, setMode] = useState<'menu' | 'scanning' | 'history'>('menu')
  const [cameraActive, setCameraActive] = useState(false)
  const [validations, setValidations] = useState<TransferValidation[]>([])
  const [manualInput, setManualInput] = useState('')
  const [eventId, setEventId] = useState('')
  const [scanResult, setScanResult] = useState<TransferValidation | null>(null)
  const [busy, setBusy] = useState(false)

  const startCamera = () => {
    setCameraActive(true)
  }

  const stopCamera = () => {
    setCameraActive(false)
  }

  async function validateTransfer(payload: string) {
    const trimmed = payload.trim()
    if (!trimmed) return
    let parsedEventId = eventId.trim()
    let qrPayload = trimmed
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      if (typeof parsed.event_id === 'string') parsedEventId = parsed.event_id
      if (typeof parsed.eventId === 'string') parsedEventId = parsed.eventId
    } catch {
      qrPayload = trimmed
    }
    if (!parsedEventId) {
      const failed: TransferValidation = {
        id: String(Date.now()),
        transferId: trimmed,
        eventId: '',
        eventName: '',
        guestName: '',
        amount: 0,
        status: 'invalid',
        timestamp: formatEventDateTime(new Date()),
        message: 'Enter the event ID, or scan a ticket QR that includes it.',
      }
      setScanResult(failed)
      setValidations((prev) => [failed, ...prev])
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: parsedEventId,
          qr_payload: qrPayload,
          checkin_code: trimmed.length <= 32 ? trimmed : undefined,
          confirm: true,
        }),
      })
      const json = await res.json()
      const ok = Boolean(json.status)
      const result: TransferValidation = {
        id: String(Date.now()),
        transferId: trimmed.slice(0, 40),
        eventId: parsedEventId,
        eventName: String(json.data?.event_title ?? ''),
        guestName: String(json.data?.buyer_name ?? ''),
        amount: Number(json.data?.amount_paid ?? 0),
        status: ok ? 'valid' : json.code === 'ALREADY_USED' ? 'duplicate' : 'invalid',
        timestamp: formatEventDateTime(new Date()),
        message: json.message ?? (ok ? 'Ticket checked in' : 'Check-in failed'),
      }
      setScanResult(result)
      setValidations((prev) => [result, ...prev])
      setManualInput('')
    } catch {
      const failed: TransferValidation = {
        id: String(Date.now()),
        transferId: trimmed,
        eventId: parsedEventId,
        eventName: '',
        guestName: '',
        amount: 0,
        status: 'invalid',
        timestamp: formatEventDateTime(new Date()),
        message: 'Could not reach ɃU.',
      }
      setScanResult(failed)
    } finally {
      setBusy(false)
    }
  }

  const handleManualEntry = () => {
    if (manualInput.trim()) void validateTransfer(manualInput.trim())
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'valid':
        return <CheckCircle className="h-5 w-5 text-green-400" />
      case 'invalid':
      case 'duplicate':
      case 'not_found':
        return <XCircle className="h-5 w-5 text-red-400" />
      default:
        return null
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'valid':
        return 'bg-green-400/10 border-green-400/30'
      case 'invalid':
      case 'duplicate':
      case 'not_found':
        return 'bg-red-400/10 border-red-400/30'
      default:
        return 'bg-card'
    }
  }

  return (
    <div className="space-y-6 pb-24 pt-4">
      {/* Info Card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-4 mb-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold">ɃU Transfer Validation</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Validate ɃU transfer confirmations from guests. Physical Bison Notes cannot be scanned or redeemed - they are ceremonial tokens only.
            </p>
          </div>
        </div>
      </Card>

      {mode === 'menu' && (
        <>
          <h2 className="text-xl font-bold">Transfer Validation</h2>

          <Card className="border-primary/30 cursor-pointer bg-gradient-to-br from-primary/10 to-primary/5 p-6 transition-all hover:border-primary/60 hover:shadow-lg">
            <div
              onClick={() => {
                setMode('scanning')
                startCamera()
              }}
            >
              <h3 className="text-lg font-semibold">Validate Transfer</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Scan QR code or enter transfer ID to confirm ɃU transfer from guest
              </p>
            </div>
          </Card>

          <Card
            onClick={() => setMode('history')}
            className="border-primary/30 cursor-pointer bg-gradient-to-br from-primary/10 to-primary/5 p-6 transition-all hover:border-primary/60 hover:shadow-lg"
          >
            <h3 className="text-lg font-semibold">Validation History</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              View all validated ɃU transfers
            </p>
          </Card>
        </>
      )}

      {mode === 'scanning' && (
        <>
          <div className="mb-4">
            <Button
              onClick={() => {
                setMode('menu')
                stopCamera()
                setScanResult(null)
              }}
              variant="outline"
              className="w-full"
            >
              ← Back
            </Button>
          </div>

          <h2 className="text-xl font-bold">Validate ɃU Transfer</h2>

          {/* Camera Preview */}
          {cameraActive && (
            <Card className="border-primary/20 bg-card p-4">
              <TicketQrScanner
                readerId="bu-validate-reader"
                active={cameraActive}
                onScan={(text) => void validateTransfer(text)}
              />
            </Card>
          )}

          {/* Manual Entry */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground">
              Event ID (required unless the QR includes it)
            </p>
            <input
              type="text"
              placeholder="Event ID"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground"
            />
            <p className="text-sm font-semibold text-muted-foreground">
              Ticket QR or check-in code
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Paste ticket QR or check-in code"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground"
              />
              <Button
                onClick={handleManualEntry}
                disabled={busy}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {busy ? 'Checking…' : 'Validate'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the transfer ID from the guest's ɃU transfer confirmation
            </p>
          </div>

          {/* Validation Result */}
          {scanResult && (
            <Card
              className={`border ${getStatusColor(scanResult.status)} p-4`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{getStatusIcon(scanResult.status)}</div>
                <div className="flex-1">
                  <h3 className="font-semibold capitalize">
                    {scanResult.status === 'valid' ? 'Transfer Validated' : 'Validation Failed'}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {scanResult.message}
                  </p>
                  {scanResult.status === 'valid' && (
                    <div className="mt-3 space-y-1 rounded-lg bg-background/50 p-2 text-sm">
                      <p>
                        <span className="text-muted-foreground">Event:</span>{' '}
                        <span className="font-semibold">{scanResult.eventName}</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Guest:</span>{' '}
                        <span className="font-semibold">{scanResult.guestName}</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Amount:</span>{' '}
                        <span className="font-bold text-primary">
                          Ƀ {scanResult.amount.toLocaleString()}
                        </span>
                      </p>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Transfer ID: {scanResult.transferId} · {scanResult.timestamp}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {mode === 'history' && (
        <>
          <div className="mb-4">
            <Button
              onClick={() => setMode('menu')}
              variant="outline"
              className="w-full"
            >
              ← Back
            </Button>
          </div>

          <h2 className="text-xl font-bold">Validation History</h2>

          <div className="space-y-3">
            {validations.length === 0 && (
              <p className="text-sm text-muted-foreground">No check-ins yet this session.</p>
            )}
            {validations.map((validation) => (
              <Card
                key={validation.id}
                className={`border ${getStatusColor(validation.status)} p-4`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(validation.status)}
                      <h3 className="font-semibold">{validation.transferId}</h3>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {validation.message}
                    </p>
                    {validation.status === 'valid' && (
                      <div className="mt-2 space-y-1 text-sm">
                        <p>
                          <span className="text-muted-foreground">Event:</span>{' '}
                          <span className="font-semibold">{validation.eventName}</span>
                        </p>
                        <p>
                          <span className="text-muted-foreground">Guest:</span>{' '}
                          <span className="font-semibold">{validation.guestName}</span>
                      </p>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">{validation.timestamp}</p>
                  </div>
                  {validation.status === 'valid' && (
                    <div className="text-right">
                      <p className="font-bold text-primary">
                        Ƀ {validation.amount.toLocaleString()}
                    </p>
                      <span className="inline-block rounded-full bg-green-400/20 px-2 py-1 text-xs text-green-400 mt-1">
                        Valid
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
