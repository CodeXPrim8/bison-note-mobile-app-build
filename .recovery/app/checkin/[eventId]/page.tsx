'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { Html5Qrcode } from 'html5-qrcode'
import { PublicShell } from '@/components/public-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface SnapshotTicket {
  id: string
  checkin_code: string | null
  qr_code_data: string | null
  status: string
  buyer_name: string | null
  buyer_email: string
}

interface CheckinResponse {
  status: boolean
  message: string
  data?: { status: string; message: string }
}

const dbKey = (eventId: string) => `bu-checkin-snapshot-${eventId}`
const queueKey = (eventId: string) => `bu-checkin-queue-${eventId}`

export default function CheckinPage() {
  const params = useParams<{ eventId: string }>()
  const eventId = params.eventId
  const [code, setCode] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [offline, setOffline] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    setOffline(!navigator.onLine)
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    if (navigator.onLine) syncQueue().catch(() => undefined)
  }, [eventId, offline])

  async function downloadSnapshot() {
    const res = await fetch(`/api/checkin/${eventId}/snapshot`)
    const json = (await res.json()) as { status: boolean; data?: { attendees: SnapshotTicket[] } }
    if (json.status && json.data) {
      localStorage.setItem(dbKey(eventId), JSON.stringify(json.data.attendees))
      setResult(`Downloaded ${json.data.attendees.length} attendees for offline mode`)
    } else {
      setResult('Could not download attendee list')
    }
  }

  async function syncQueue() {
    const raw = localStorage.getItem(queueKey(eventId))
    const queue = raw ? (JSON.parse(raw) as string[]) : []
    const remaining: string[] = []
    for (const item of queue) {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, checkin_code: item }),
      })
      if (!res.ok) remaining.push(item)
    }
    localStorage.setItem(queueKey(eventId), JSON.stringify(remaining))
  }

  async function submit(value: string) {
    const checkinCode = value.trim().toUpperCase()
    if (!checkinCode) return
    if (!navigator.onLine) {
      const attendees = JSON.parse(localStorage.getItem(dbKey(eventId)) || '[]') as SnapshotTicket[]
      const match = attendees.find(
        (row) => row.checkin_code === checkinCode || row.qr_code_data === checkinCode,
      )
      const queue = JSON.parse(localStorage.getItem(queueKey(eventId)) || '[]') as string[]
      queue.push(checkinCode)
      localStorage.setItem(queueKey(eventId), JSON.stringify(queue))
      setResult(match ? `Offline queued (${match.status})` : 'Offline queued (unknown locally)')
      return
    }
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, qr_payload: checkinCode, checkin_code: checkinCode }),
    })
    const json = (await res.json()) as CheckinResponse
    setResult(json.data?.message ?? json.message)
    setCode('')
  }

  async function startScan() {
    setScanning(true)
    const scanner = new Html5Qrcode('bu-checkin-reader')
    scannerRef.current = scanner
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 8, qrbox: 220 },
      (decoded) => {
        submit(decoded).catch(() => undefined)
      },
      () => undefined,
    )
  }

  async function stopScan() {
    await scannerRef.current?.stop()
    scannerRef.current = null
    setScanning(false)
  }

  return (
    <PublicShell title="Check-in">
      <div className="px-4 py-6 space-y-3 pb-16">
        {offline && <p className="text-xs text-yellow-400">Offline mode — scans will sync later.</p>}
        <div id="bu-checkin-reader" className="overflow-hidden rounded-xl" />
        <div className="flex gap-2">
          {!scanning ? (
            <Button className="flex-1" onClick={() => startScan().catch(() => setResult('Camera unavailable'))}>
              Open camera
            </Button>
          ) : (
            <Button className="flex-1" variant="outline" onClick={() => stopScan().catch(() => undefined)}>
              Stop camera
            </Button>
          )}
          <Button variant="outline" onClick={() => downloadSnapshot()}>
            Download list
          </Button>
        </div>
        <Input
          placeholder="6-character code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit(code).catch(() => undefined)
          }}
        />
        <Button onClick={() => submit(code)}>Validate</Button>
        {result && <Card className="p-4 font-semibold">{result}</Card>}
      </div>
    </PublicShell>
  )
}
