'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { TicketQrScanner } from '@/components/web/ticket-qr-scanner'

interface Result {
  status: string
  message: string
  event_title?: string
  tier_name?: string
  buyer_name?: string
  ticket?: { buyer_name?: string; buyer_email?: string; status?: string; ticket_number?: string }
}

export default function CheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const [eventId, setEventId] = useState('')
  const [code, setCode] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [camera, setCamera] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    params.then(({ id }) => setEventId(id))
  }, [params])

  async function scan(payload: string | undefined, confirm: boolean) {
    if (!eventId) return
    setBusy(true)
    const value = (payload || code).trim()
    const looksLikeJson = value.startsWith('{') || /BU_LIVE_/i.test(value)
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: eventId,
        confirm,
        qr_payload: looksLikeJson ? value : undefined,
        checkin_code: looksLikeJson ? undefined : value,
      }),
    })
    const json = await res.json()
    setResult(json.data ?? json)
    setBusy(false)
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-3xl font-bold">Scan ticket</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ticket QR codes are for event access only — never for Bison Note value.
      </p>
      <Card className="mt-6 space-y-4 p-6">
        <Button variant={camera ? 'default' : 'outline'} className="w-full" onClick={() => setCamera((v) => !v)}>
          {camera ? 'Stop camera' : 'Open camera'}
        </Button>
        {camera && (
          <TicketQrScanner
            active={camera}
            onScan={(text) => {
              setCode(text)
              void scan(text, false)
              setCamera(false)
            }}
          />
        )}
        <Input
          placeholder="Backup check-in code or QR JSON"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button className="w-full" disabled={busy} onClick={() => scan(code, false)}>
          Check ticket
        </Button>
        {result && (
          <div
            className={`rounded-xl border p-4 ${
              result.status === 'valid' || result.status === 'checked_in'
                ? 'border-primary/30 bg-primary/10'
                : 'border-destructive/40 bg-destructive/15'
            }`}
          >
            <p className="text-lg font-bold">{result.message || result.status}</p>
            {(result.buyer_name || result.ticket) && (
              <p className="mt-2 text-sm text-muted-foreground">
                {result.buyer_name ?? result.ticket?.buyer_name} · {result.tier_name}
              </p>
            )}
            {result.event_title && <p className="text-sm text-muted-foreground">{result.event_title}</p>}
            {result.ticket?.ticket_number && (
              <p className="mt-1 font-mono text-xs">{result.ticket.ticket_number}</p>
            )}
            {result.status === 'valid' && (
              <Button className="mt-4 w-full" disabled={busy} onClick={() => scan(code, true)}>
                Check in
              </Button>
            )}
          </div>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">
        Scan from the check-in page for the same event the ticket was bought for. If the camera fails, type the backup
        code shown under the guest QR.
      </p>
    </div>
  )
}
