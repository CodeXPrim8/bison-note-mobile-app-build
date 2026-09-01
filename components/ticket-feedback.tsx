'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { isCheckedInTicket } from '@/lib/events/sale'
import { formatEventDate } from '@/lib/datetime'
import { eventVenueLabel } from '@/lib/events/event-details'
import type { EventRecord, TicketRecord, TicketTier } from '@/lib/types/database'

type FeedbackTicket = TicketRecord & {
  event?: EventRecord | null
  tier?: TicketTier | null
  display_status?: string
}

export function TicketFeedbackForm({
  ticket,
  onSaved,
}: {
  ticket: FeedbackTicket
  onSaved?: (ticket: FeedbackTicket) => void
}) {
  const [open, setOpen] = useState(false)
  const [comment, setComment] = useState(ticket.guest_comment ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(ticket.guest_comment ? 'Comment sent to the organiser.' : null)

  async function save() {
    setBusy(true)
    setMessage(null)
    const res = await fetch('/api/tickets/feedback', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: ticket.id, comment }),
    })
    const json = await res.json()
    setBusy(false)
    if (!json.status) {
      setMessage(json.message ?? 'Could not save comment')
      return
    }
    setMessage('Thanks — your comment was sent to the organiser.')
    onSaved?.({ ...ticket, guest_comment: comment, ...(json.data ?? {}) })
  }

  return (
    <Card className="p-4">
      <button type="button" className="w-full text-left" onClick={() => setOpen((value) => !value)}>
        <p className="font-semibold">{ticket.event?.title ?? 'Event'}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {ticket.tier?.name ?? 'General'}
          {ticket.event?.start_time ? ` · ${formatEventDate(ticket.event.start_time)}` : ''}
          {eventVenueLabel(ticket.event) ? ` · ${eventVenueLabel(ticket.event)}` : ''}
        </p>
        <span className="mt-2 inline-block rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
          {isCheckedInTicket(ticket) ? 'Attended' : 'Ended'}
        </span>
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Tell the organiser how the {/party/i.test(`${ticket.event?.category ?? ''} ${ticket.event?.title ?? ''}`) ? 'party' : 'event'} was. This goes to their guest report.
          </p>
          <Textarea
            rows={4}
            maxLength={1000}
            placeholder="How was it? What should they do next time?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <Button className="w-full" disabled={busy || comment.trim().length < 3} onClick={() => void save()}>
            {busy ? 'Sending…' : ticket.guest_comment ? 'Update comment' : 'Send comment'}
          </Button>
          {message && <p className="text-xs text-muted-foreground">{message}</p>}
        </div>
      )}
    </Card>
  )
}
