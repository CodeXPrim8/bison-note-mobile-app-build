'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import QRCode from 'qrcode'
import type { EventRecord, TicketRecord, TicketTier } from '@/lib/types/database'

interface TicketRow extends TicketRecord {
  event: EventRecord | null
  tier: TicketTier | null
  display_status: string
}

export default function MyTickets({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [qrs, setQrs] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<TicketRow | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/tickets/mine')
      .then(async (res) => {
        const json = await res.json()
        setLoaded(true)
        if (!json.status) {
          setMessage(json.message ?? 'Sign in to see tickets.')
          return
        }
        setTickets(json.data ?? [])
      })
      .catch(() => {
        setLoaded(true)
        setMessage('Could not load tickets')
      })
  }, [])

  useEffect(() => {
    async function render() {
      const next: Record<string, string> = {}
      for (const ticket of tickets) {
        if (ticket.qr_code_data) next[ticket.id] = await QRCode.toDataURL(ticket.qr_code_data, { width: 280, margin: 1 })
      }
      setQrs(next)
    }
    if (tickets.length) void render()
  }, [tickets])

  if (!loaded) {
    return <p className="px-4 py-10 text-sm text-muted-foreground">Loading tickets…</p>
  }

  if (tickets.length === 0) {
    return (
      <div className="px-4 pb-24 pt-8 text-center">
        <h2 className="text-2xl font-bold">No Ticket</h2>
        <p className="mt-2 text-sm text-muted-foreground">You don&apos;t have any event tickets yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">Explore upcoming events to find your next experience.</p>
        {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}
        <Button className="mt-6" onClick={() => onNavigate?.('events')}>
          Explore Events
        </Button>
      </div>
    )
  }

  if (selected) {
    return (
      <div className="space-y-4 px-4 pb-24 pt-4">
        <Button variant="outline" onClick={() => setSelected(null)}>
          ← My tickets
        </Button>
        <Card className="p-6 text-center">
          <h2 className="text-xl font-bold">{selected.event?.title}</h2>
          <p className="text-sm text-muted-foreground">{selected.tier?.name}</p>
          {qrs[selected.id] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrs[selected.id]} alt="Ticket QR" className="mx-auto mt-4 h-56 w-56 rounded bg-white p-2" />
          )}
          <p className="mt-4 font-mono text-2xl tracking-[0.3em]">{selected.checkin_code}</p>
          <p className="text-xs text-muted-foreground">Backup check-in · event access only</p>
          <p className="mt-2 text-xs uppercase text-primary">{selected.display_status}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 px-4 pb-24 pt-4">
      <h2 className="text-xl font-bold">My Tickets</h2>
      {tickets.map((ticket) => (
        <Card key={ticket.id} className="cursor-pointer p-4" onClick={() => setSelected(ticket)}>
          <p className="font-semibold">{ticket.event?.title}</p>
          <p className="text-sm text-muted-foreground">
            {ticket.event ? new Date(ticket.event.start_time).toLocaleDateString() : ''} · {ticket.tier?.name}
          </p>
          <p className="mt-1 font-mono text-sm">{ticket.ticket_number}</p>
          <Button className="mt-3 w-full" variant="outline">
            View ticket
          </Button>
        </Card>
      ))}
    </div>
  )
}
