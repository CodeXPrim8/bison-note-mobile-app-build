'use client'

import { useEffect, useState } from 'react'
import { SiteHeader } from '@/components/web/site-chrome'
import { Button } from '@/components/ui/button'
import QRCode from 'qrcode'
import { ticketQrScanString } from '@/lib/tickets/qr-generator'
import { isCheckedInTicket, isEventUpcoming, isEventPast } from '@/lib/events/sale'
import { TicketAdmitCard } from '@/components/ticket-admit'
import { TicketFeedbackForm } from '@/components/ticket-feedback'
import { TicketPass } from '@/components/ticket-pass'
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
          setTickets([])
          setMessage(json.message ?? 'Sign in to see your tickets.')
          return
        }
        const list = (json.data ?? []) as TicketRow[]
        setTickets(list)
        setMessage(null)
        const wanted = new URLSearchParams(window.location.search).get('id')
        setSelected((current) => {
          const id = wanted || current?.id
          if (!id) return current
          return list.find((ticket) => ticket.id === id) ?? current
        })
      } catch {
        if (!cancelled) {
          setLoaded(true)
          setTickets((current) => {
            if (!current.length) setMessage('Could not load tickets')
            return current
          })
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
          next[ticket.id] = await QRCode.toDataURL(ticketQrScanString(ticket), {
            width: 420,
            margin: 1,
            color: { dark: '#111111', light: '#ffffff' },
          })
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
      <main className="mx-auto max-w-lg px-4 py-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">Gate pass</p>
        <h1 className="mt-1 text-3xl font-bold">My tickets</h1>
        {upcoming.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            {upcoming.length} upcoming {upcoming.length === 1 ? 'pass' : 'passes'} · tap a ticket to show the QR
          </p>
        )}
        {message && upcoming.length === 0 && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
        {loaded && upcoming.length === 0 && (
          <div className="mt-10 rounded-3xl border border-white/10 bg-card p-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-2xl">🎫</div>
            <h2 className="text-xl font-bold">No upcoming tickets</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {history.length
                ? 'Events you already attended are listed below in history.'
                : "You don't have any event tickets yet."}
            </p>
            {!history.length && (
              <p className="mt-1 text-sm text-muted-foreground">Explore upcoming events to discover your next night out.</p>
            )}
            <Button asChild className="mt-5">
              <a href="/events">Explore Events</a>
            </Button>
          </div>
        )}
        <div className="mt-8 space-y-5">
          {upcoming.map((ticket) => (
            <TicketPass key={ticket.id} ticket={ticket} variant="list" onOpen={() => setSelected(ticket)} />
          ))}
        </div>
        {selected && !isEventPast(selected.event) && (
          <TicketAdmitCard ticket={selected} qr={qrs[selected.id]} onClose={() => setSelected(null)} />
        )}
        {history.length > 0 && (
          <div className="mt-14">
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
