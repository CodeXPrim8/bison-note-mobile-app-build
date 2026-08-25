'use client'

import { useEffect, useState } from 'react'
import { PublicShell } from '@/components/public-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import QRCode from 'qrcode'
import type { EventRecord, TicketRecord } from '@/lib/types/database'

interface TicketWithEvent extends TicketRecord {
  event: EventRecord | null
}

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<TicketWithEvent[]>([])
  const [qrs, setQrs] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<TicketWithEvent | null>(null)

  useEffect(() => {
    fetch('/api/tickets/mine')
      .then(async (res) => {
        const json = (await res.json()) as { status: boolean; message?: string; data?: TicketWithEvent[] }
        if (!json.status) {
          setMessage(json.message ?? 'Sign in to see tickets, or complete checkout as a guest.')
          return
        }
        setTickets(json.data ?? [])
      })
      .catch(() => setMessage('Could not load tickets'))
  }, [])

  useEffect(() => {
    async function render() {
      const next: Record<string, string> = {}
      for (const ticket of tickets) {
        if (ticket.qr_code_data) {
          next[ticket.id] = await QRCode.toDataURL(ticket.qr_code_data, { width: 280, margin: 1 })
        }
      }
      setQrs(next)
    }
    if (tickets.length) render().catch(() => undefined)
  }, [tickets])

  return (
    <PublicShell title="My tickets">
      <div className="px-4 py-6 space-y-3 pb-16">
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        {tickets.length === 0 && !message && <p className="text-sm text-muted-foreground">No tickets yet.</p>}
        {tickets.map((ticket) => (
          <Card key={ticket.id} className="p-4 cursor-pointer" onClick={() => setSelected(ticket)}>
            <p className="font-semibold">{ticket.event?.title ?? 'BU Event'}</p>
            <p className="text-xs text-muted-foreground">
              {ticket.event ? new Date(ticket.event.start_time).toLocaleString() : ticket.status}
            </p>
            <p className="mt-2 font-mono text-lg tracking-widest">{ticket.checkin_code}</p>
          </Card>
        ))}
        {selected && (
          <Card className="p-4 text-center space-y-3">
            <p className="font-semibold">{selected.event?.title}</p>
            {qrs[selected.id] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrs[selected.id]} alt="Ticket QR" className="mx-auto w-56 h-56 bg-white p-2 rounded" />
            )}
            <p className="font-mono text-2xl tracking-[0.3em]">{selected.checkin_code}</p>
            <Button
              variant="outline"
              onClick={() => {
                const pass = {
                  format: 'bu-wallet-pass-stub',
                  ticket_id: selected.id,
                  event: selected.event?.title,
                  checkin_code: selected.checkin_code,
                }
                const blob = new Blob([JSON.stringify(pass, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `bu-ticket-${selected.checkin_code}.json`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              Save pass stub
            </Button>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Close
            </Button>
          </Card>
        )}
      </div>
    </PublicShell>
  )
}
