'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PublicShell } from '@/components/public-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { TicketRecord } from '@/lib/types/database'

export default function AttendeesPage() {
  const params = useParams<{ eventId: string }>()
  const [rows, setRows] = useState<TicketRecord[]>([])
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/events/${params.eventId}/attendees`)
      .then(async (res) => {
        const json = (await res.json()) as { status: boolean; message?: string; data?: { attendees: TicketRecord[] } }
        if (!json.status) setMessage(json.message ?? 'Could not load attendees')
        else setRows(json.data?.attendees ?? [])
      })
      .catch(() => setMessage('Could not load attendees'))
  }, [params.eventId])

  const filtered = rows.filter((row) => {
    const q = query.toLowerCase()
    if (!q) return true
    return (
      (row.buyer_name ?? '').toLowerCase().includes(q) ||
      row.buyer_email.toLowerCase().includes(q) ||
      (row.checkin_code ?? '').toLowerCase().includes(q)
    )
  })

  function exportCsv() {
    const header = 'name,email,phone,status,checkin_code,checked_in_at'
    const body = filtered
      .map((row) =>
        [row.buyer_name, row.buyer_email, row.buyer_phone, row.status, row.checkin_code, row.checked_in_at]
          .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n')
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendees-${params.eventId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PublicShell title="Attendees">
      <div className="px-4 py-6 space-y-3 pb-16">
        <Input placeholder="Search name, email, code" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button variant="outline" onClick={exportCsv}>
          Export CSV
        </Button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        {filtered.map((row) => (
          <Card key={row.id} className="p-3 text-sm">
            <p className="font-semibold">{row.buyer_name ?? row.buyer_email}</p>
            <p className="text-muted-foreground">{row.buyer_email}</p>
            <p className="text-xs mt-1">
              {row.status} · {row.checkin_code}
            </p>
          </Card>
        ))}
      </div>
    </PublicShell>
  )
}
