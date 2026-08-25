'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { TicketRecord } from '@/lib/types/database'

export default function EventTicketsPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('')
  const [tickets, setTickets] = useState<TicketRecord[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    params.then(({ id: value }) => setId(value))
  }, [params])

  useEffect(() => {
    if (!id) return
    fetch(`/api/events/${id}/attendees`)
      .then(async (res) => {
        const json = await res.json()
        if (json.status) setTickets(json.data.tickets ?? [])
      })
      .catch(() => undefined)
  }, [id])

  const filtered = tickets.filter((ticket) => {
    const hay = `${ticket.buyer_name} ${ticket.buyer_email} ${ticket.ticket_number} ${ticket.checkin_code}`.toLowerCase()
    return hay.includes(query.toLowerCase())
  })

  function exportCsv() {
    const rows = [['ticket_number', 'name', 'email', 'status', 'checkin_code'], ...filtered.map((t) => [t.ticket_number, t.buyer_name, t.buyer_email, t.status, t.checkin_code])]
    const csv = rows.map((row) => row.map((cell) => `"${cell ?? ''}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bu-tickets.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Ticket sales</h1>
        <button className="text-sm text-primary" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <Input className="mt-4" placeholder="Search name, email, ticket #" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="mt-4 space-y-2">
        {filtered.map((ticket) => (
          <Card key={ticket.id} className="p-4">
            <div className="flex justify-between">
              <div>
                <p className="font-semibold">{ticket.buyer_name ?? ticket.buyer_email}</p>
                <p className="text-xs text-muted-foreground">{ticket.ticket_number} · {ticket.buyer_email}</p>
              </div>
              <span className="text-xs uppercase text-primary">{ticket.status}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
