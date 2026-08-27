'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import QRCode from 'qrcode'
import { publicTicketStatus } from '@/lib/types/database'
import { isEventUpcoming } from '@/lib/events/sale'
import { ticketQrScanString } from '@/lib/tickets/qr-generator'
import type { EventRecord, TicketRecord, TicketTier } from '@/lib/types/database'

interface TicketRow extends TicketRecord {
  event: EventRecord | null
  tier: TicketTier | null
  display_status: string
}

export default function MyTickets({
  onNavigate,
  ticketId,
}: {
  onNavigate?: (page: string) => void
  ticketId?: string
}) {
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [qrs, setQrs] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<TicketRow | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/tickets/mine', { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json()
        setLoaded(true)
        if (!json.status) {
          setMessage(json.message ?? 'Sign in to see tickets.')
          return
        }
        const list = (json.data ?? []) as TicketRow[]
        setTickets(list)
        if (ticketId) {
          const match = list.find((ticket) => ticket.id === ticketId)
          if (match && isEventUpcoming(match.event)) setSelected(match)
        }
      })
      .catch(() => {
        setLoaded(true)
        setMessage('Could not load tickets')
      })
  }, [ticketId])

  useEffect(() => {
    async function render() {
      const next: Record<string, string> = {}
      for (const ticket of tickets) {
        if (ticket.qr_code_data || ticket.checkin_code) {
          next[ticket.id] = await QRCode.toDataURL(ticketQrScanString(ticket), { width: 280, margin: 1 })
        }
      }
      setQrs(next)
    }
    if (tickets.length) void render()
  }, [tickets])

  if (!loaded) {
    return <p className="px-4 py-10 text-sm text-muted-foreground">Loading tickets…</p>
  }

  const upcoming = tickets.filter((ticket) => isEventUpcoming(ticket.event))
  const pastCount = tickets.length - upcoming.length

  if (upcoming.length === 0) {
    return (
      <div className="px-4 pb-24 pt-8 text-center">
        <h2 className="text-2xl font-bold">No upcoming tickets</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {pastCount
            ? 'Events you already attended are in History.'
            : "You don't have any event tickets yet."}
        </p>
        {!pastCount && (
          <p className="mt-1 text-sm text-muted-foreground">Explore upcoming events to find your next experience.</p>
        )}
        {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}
        <Button className="mt-6" onClick={() => onNavigate?.(pastCount ? 'history' : 'events')}>
          {pastCount ? 'Open history' : 'Explore Events'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 px-4 pb-24 pt-4">
      <h2 className="text-xl font-bold">My tickets</h2>
      {upcoming.map((ticket) => (
        <Card key={ticket.id} className="cursor-pointer p-4" onClick={() => setSelected(ticket)}>
          <p className="font-semibold">{ticket.event?.title}</p>
          <p className="text-sm text-muted-foreground">
            {ticket.tier?.name} · {ticket.ticket_number}
          </p>
          <p className="mt-1 text-xs text-primary">
            {ticket.display_status ?? publicTicketStatus(ticket.status, ticket.event?.end_time)}
          </p>
        </Card>
      ))}
      {selected && (
        <Card className="p-6 text-center">
          <h2 className="text-xl font-bold">{selected.event?.title}</h2>
          {qrs[selected.id] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrs[selected.id]} alt="Ticket QR" className="mx-auto mt-4 h-56 w-56 rounded bg-white p-2" />
          )}
          <p className="mt-4 font-mono text-2xl tracking-[0.25em]">{selected.checkin_code}</p>
          <p className="text-xs text-muted-foreground">Backup check-in code · event access only</p>
          <Button className="mt-4" variant="ghost" onClick={() => setSelected(null)}>
            Close
          </Button>
        </Card>
      )}
    </div>
  )
}
