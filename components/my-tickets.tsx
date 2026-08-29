'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import QRCode from 'qrcode'
import { publicTicketStatus } from '@/lib/types/database'
import { isCheckedInTicket, isEventUpcoming } from '@/lib/events/sale'
import { ticketQrScanString } from '@/lib/tickets/qr-generator'
import { TicketAdmitCard } from '@/components/ticket-admit'
import type { EventRecord, TicketRecord, TicketTier } from '@/lib/types/database'
import { readSessionSnapshot, writeSessionSnapshot } from '@/lib/session-snapshot'

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
  const cached = readSessionSnapshot<TicketRow[]>('bu_my_tickets')
  const [tickets, setTickets] = useState<TicketRow[]>(cached ?? [])
  const [qrs, setQrs] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<TicketRow | null>(null)
  const [loaded, setLoaded] = useState(Boolean(cached))

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/tickets/mine', { credentials: 'include' })
        const json = await res.json()
        if (cancelled) return
        setLoaded(true)
        if (!json.status) {
          setMessage(json.message ?? 'Sign in to see tickets.')
          return
        }
        const list = (json.data ?? []) as TicketRow[]
        setTickets(list)
        writeSessionSnapshot('bu_my_tickets', list)
        setSelected((current) => {
          const wanted = ticketId || current?.id
          if (!wanted) return current
          const match = list.find((ticket) => ticket.id === wanted)
          if (match && (isEventUpcoming(match.event) || isCheckedInTicket(match))) return match
          return current
        })
      } catch {
        if (!cancelled) {
          setLoaded(true)
          setMessage('Could not load tickets')
        }
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 8000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [ticketId])

  useEffect(() => {
    async function render() {
      const next: Record<string, string> = {}
      for (const ticket of tickets) {
        if (isCheckedInTicket(ticket)) continue
        if (ticket.qr_code_data || ticket.checkin_code) {
          next[ticket.id] = await QRCode.toDataURL(ticketQrScanString(ticket), { width: 280, margin: 1 })
        }
      }
      setQrs(next)
    }
    if (tickets.length) void render()
  }, [tickets])

  if (!loaded) {
    return null
  }

  const upcoming = tickets.filter((ticket) => isEventUpcoming(ticket.event) || isCheckedInTicket(ticket))
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
            {isCheckedInTicket(ticket)
              ? 'CHECKED IN'
              : ticket.display_status ?? publicTicketStatus(ticket.status, ticket.event?.end_time)}
          </p>
        </Card>
      ))}
      {selected && (
        <TicketAdmitCard ticket={selected} qr={qrs[selected.id]} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
