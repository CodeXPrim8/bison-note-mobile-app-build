'use client'

import { useEffect, useState } from 'react'
import { SiteHeader } from '@/components/web/site-chrome'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import QRCode from 'qrcode'
import { publicTicketStatus } from '@/lib/types/database'
import type { EventRecord, TicketRecord, TicketTier } from '@/lib/types/database'

interface TicketRow extends TicketRecord {
  event: EventRecord | null
  tier: TicketTier | null
  display_status: string
}

export default function TicketsClient() {
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
          setMessage(json.message ?? 'Sign in to see your tickets.')
          return
        }
        setTickets(json.data ?? [])
        const wanted = new URLSearchParams(window.location.search).get('id')
        if (wanted) {
          const match = (json.data as TicketRow[] | undefined)?.find((ticket) => ticket.id === wanted)
          if (match) setSelected(match)
        }
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

  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-3xl font-bold">My tickets</h1>
        {message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
        {loaded && tickets.length === 0 && (
          <Card className="mt-8 p-8 text-center">
            <h2 className="text-xl font-bold">No Ticket</h2>
            <p className="mt-2 text-sm text-muted-foreground">You don&apos;t have any event tickets yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Explore upcoming events to discover your next experience.</p>
            <Button asChild className="mt-4">
              <a href="/events">Explore Events</a>
            </Button>
          </Card>
        )}
        <div className="mt-6 space-y-3">
          {tickets.map((ticket) => (
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
        </div>
        {selected && (
          <Card className="mt-6 p-6 text-center">
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
      </main>
    </div>
  )
}
