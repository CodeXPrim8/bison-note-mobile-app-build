'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import QRCode from 'qrcode'
import { isCheckedInTicket, isEventUpcoming } from '@/lib/events/sale'
import { ticketQrScanString } from '@/lib/tickets/qr-generator'
import { TicketAdmitCard } from '@/components/ticket-admit'
import { TicketPass } from '@/components/ticket-pass'
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
          setTickets((current) => {
            if (!current.length) setMessage(json.message ?? 'Sign in to see tickets.')
            return current
          })
          return
        }
        const list = (json.data ?? []) as TicketRow[]
        setTickets(list)
        setMessage(null)
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
  }, [ticketId])

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

  if (!loaded) {
    return null
  }

  const upcoming = tickets.filter((ticket) => isEventUpcoming(ticket.event) || isCheckedInTicket(ticket))
  const pastCount = tickets.length - upcoming.length

  if (upcoming.length === 0) {
    return (
      <div className="px-4 pb-24 pt-10 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-2xl">🎫</div>
        <h2 className="text-2xl font-bold">No upcoming tickets</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {pastCount
            ? 'Events you already attended are in History.'
            : "You don't have any event tickets yet."}
        </p>
        {!pastCount && (
          <p className="mt-1 text-sm text-muted-foreground">Explore upcoming events to find your next night out.</p>
        )}
        {message && !pastCount && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}
        <Button className="mt-6" onClick={() => onNavigate?.(pastCount ? 'history' : 'events')}>
          {pastCount ? 'Open history' : 'Explore Events'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5 px-4 pb-24 pt-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">Gate pass</p>
        <h2 className="mt-1 text-2xl font-bold">My tickets</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {upcoming.length} upcoming {upcoming.length === 1 ? 'pass' : 'passes'}
        </p>
      </div>
      {upcoming.map((ticket) => (
        <TicketPass key={ticket.id} ticket={ticket} variant="list" onOpen={() => setSelected(ticket)} />
      ))}
      {selected && (
        <TicketAdmitCard ticket={selected} qr={qrs[selected.id]} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
