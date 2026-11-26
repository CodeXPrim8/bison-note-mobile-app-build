'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { WalletPageSummary } from '@/components/wallet-summary'
import { PinPadModal } from '@/components/pin-pad-modal'
import { BU_MIN_TRANSFER, formatBu, quotePeerMoveBu } from '@/lib/bu-rate'
import { useAccount } from '@/components/account-store'
import { QrScanPopup } from '@/components/qr-scan-popup'

type PosTarget = {
  vendorId: string
  eventId: string | null
  mode: 'event' | 'business'
  label: string
}

export function parsePosQr(raw: string): PosTarget | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (String(parsed.type ?? '') !== 'pos') return null
    const vendorId = String(parsed.vendor_id ?? parsed.vendorId ?? '')
    if (!vendorId) return null
    const eventId = parsed.event_id ? String(parsed.event_id) : null
    const mode = eventId
      ? 'event'
      : String(parsed.mode ?? 'business') === 'event'
        ? 'event'
        : 'business'
    return {
      vendorId,
      eventId,
      mode,
      label: String(parsed.label ?? (mode === 'event' ? 'Event POS' : 'Business POS')),
    }
  } catch {
    return null
  }
}

export default function PosPay({
  onBack,
  initialRaw,
}: {
  onBack?: () => void
  initialRaw?: string | null
}) {
  const { applySpendBu, userId } = useAccount()
  const [target, setTarget] = useState<PosTarget | null>(null)
  const [amount, setAmount] = useState('')
  const [pasted, setPasted] = useState('')
  const [cameraActive, setCameraActive] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function onScan(raw: string) {
    const parsed = parsePosQr(raw)
    if (!parsed) {
      setMessage('Scan a vendor POS QR.')
      return
    }
    if (parsed.vendorId === userId) {
      setMessage('That is your own POS QR.')
      return
    }
    setTarget(parsed)
    setCameraActive(false)
    setMessage(null)
  }

  useEffect(() => {
    if (!initialRaw) return
    onScan(initialRaw)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRaw])

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('bu_pos_qr')
      if (cached) {
        sessionStorage.removeItem('bu_pos_qr')
        onScan(cached)
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const amountBu = Number(amount)
  const quote = Number.isFinite(amountBu) && amountBu > 0 ? quotePeerMoveBu(amountBu, 'transfer') : null

  async function pay(pin: string) {
    if (!target || !quote) return
    if (amountBu + 1e-9 < BU_MIN_TRANSFER) {
      setPinError(`Minimum is ${BU_MIN_TRANSFER} ɃU`)
      return
    }
    setBusy(true)
    setPinError(null)
    try {
      const res = await fetch('/api/pos/pay', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_user_id: target.vendorId,
          event_id: target.eventId,
          amount: amountBu,
          pin,
        }),
      })
      const json = await res.json()
      setBusy(false)
      if (!json.status) {
        if (json.code === 'WRONG_PIN') {
          setPinError(json.message || 'Incorrect PIN')
          return
        }
        setPinOpen(false)
        setMessage(json.message ?? 'Payment failed')
        return
      }
      setPinOpen(false)
      applySpendBu(Number(json.data?.total_debit_bu ?? quote.totalDebitBu))
      setDone(true)
      setMessage(null)
    } catch {
      setBusy(false)
      setPinOpen(false)
      setMessage('Could not reach ɃU.')
    }
  }

  if (done) {
    return (
      <div className="space-y-4 px-4 pb-28 pt-4">
        <WalletPageSummary kicker="POS" title="Paid" detail="Vendor will issue your notes." />
        <Button className="w-full" onClick={() => onBack?.() || window.location.assign('/app')}>
          Done
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 px-4 pb-28 pt-4 text-neutral-950">
      <WalletPageSummary
        kicker="POS"
        title="Pay with ɃU"
        detail="Scan a vendor Business or Event POS QR, then enter amount + PIN."
      />
      {onBack ? (
        <Button variant="outline" className="w-full" onClick={onBack}>
          ← Back
        </Button>
      ) : null}

      {!target ? (
        <Card className="space-y-3 p-4">
          <Button className="w-full" onClick={() => setCameraActive(true)}>
            Scan POS QR
          </Button>
          <QrScanPopup
            open={cameraActive}
            onClose={() => setCameraActive(false)}
            onScan={(raw) => {
              setCameraActive(false)
              onScan(raw)
            }}
            title="Scan POS QR"
            hint="Point at the vendor Business or Event POS code."
            readerId="bu-pos-pay"
          />
          <Input placeholder="Or paste POS QR payload" value={pasted} onChange={(e) => setPasted(e.target.value)} />
          <Button variant="outline" className="w-full" onClick={() => onScan(pasted)}>
            Use pasted QR
          </Button>
        </Card>
      ) : (
        <Card className="space-y-3 p-4">
          <p className="text-sm font-semibold">{target.label}</p>
          <p className="text-xs text-muted-foreground">
            {target.mode === 'event'
              ? 'Event POS · celebrant gets 90%, vendor 10%'
              : 'Business POS · vendor gets 100%'}
          </p>
          <Input
            type="number"
            min={BU_MIN_TRANSFER}
            placeholder={`Amount (min ${BU_MIN_TRANSFER})`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {quote ? (
            <p className="text-xs text-muted-foreground">
              Vendor/event receives Ƀ {formatBu(quote.bu)}. You pay Ƀ {formatBu(quote.totalDebitBu)}.
            </p>
          ) : null}
          <Button
            className="w-full"
            disabled={!quote || amountBu + 1e-9 < BU_MIN_TRANSFER || busy}
            onClick={() => {
              setPinError(null)
              setPinOpen(true)
            }}
          >
            Pay with PIN
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setTarget(null)
              setCameraActive(true)
            }}
          >
            Scan another
          </Button>
        </Card>
      )}

      {message && <p className="text-sm text-destructive">{message}</p>}

      <PinPadModal
        open={pinOpen}
        title="Confirm POS payment"
        error={pinError}
        busy={busy}
        onClose={() => setPinOpen(false)}
        onSubmit={(pin) => void pay(pin)}
      />
    </div>
  )
}
