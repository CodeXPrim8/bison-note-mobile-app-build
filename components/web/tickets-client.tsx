'use client'

import { useEffect, useState } from 'react'
import { SiteHeader } from '@/components/web/site-chrome'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import QRCode from 'qrcode'
import { publicTicketStatus } from '@/lib/types/database'
import { ticketQrScanString } from '@/lib/tickets/qr-generator'
import { isCheckedInTicket, isEventUpcoming, isEventPast } from '@/lib/events/sale'
import { TicketAdmitCard } from '@/components/ticket-admit'
import { TicketFeedbackForm } from '@/components/ticket-feedback'
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
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/tickets/mine')
        const json = await res.json()
        if (cancelled) return
        setLoaded(true)
        if (!json.status) {
          setMessage(json.message ?? 'Sign in to see your tickets.')
          return
        }
        const list = (json.data ?? []) as TicketRow[]
        setTickets(list)
        const wanted = new URLSearchParams(window.location.search).get('id')
        setSelected((current) => {
          const id = wanted || current?.id
          if (!id) return current
          return list.find((ticket) => ticket.id === id) ?? current
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
  }, [])

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

  const upcoming = tickets.filter((ticket) => isEventUpcoming(ticket.event) || (isCheckedInTicket(ticket) && !isEventPast(ticket.event)))
  const history = tickets.filter((ticket) => isEventPast(ticket.event))

  return (
    <div className="theme-pink min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-3xl font-bold">My tickets</h1>
        {message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
        {loaded && upcoming.length === 0 && (
          <Card className="mt-8 p-8 text-center">
            <h2 className="text-xl font-bold">No upcoming tickets</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {history.length
                ? 'Events you already attended are listed below in history.'
                : "You don't have any event tickets yet."}
            </p>
            {!history.length && (
              <p className="mt-1 text-sm text-muted-foreground">Explore upcoming events to discover your next experience.</p>
            )}
            <Button asChild className="mt-4">
              <a href="/events">Explore Events</a>
            </Button>
          </Card>
        )}
        <div className="mt-6 space-y-3">
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
        </div>
        {selected && !isEventPast(selected.event) && (
          <div className="mt-6">
            <TicketAdmitCard ticket={selected} qr={qrs[selected.id]} onClose={() => setSelected(null)} />
          </div>
        )}
        {history.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-bold">History</h2>
            <p className="mt-1 text-sm text-muted-foreground">Events you paid for that have already ended.</p>
            <div className="mt-4 space-y-3">
              {history.map((ticket) => (
                <TicketFeedbackForm
                  key={ticket.id}
                  ticket={ticket}
                  onSaved={(updated) =>
                    setTickets((list) => list.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)))
                  }
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
