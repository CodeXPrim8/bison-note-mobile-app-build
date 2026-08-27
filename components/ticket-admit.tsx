'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { eventWelcomeLine, isCheckedInTicket } from '@/lib/events/sale'
import { publicTicketStatus } from '@/lib/types/database'
import type { EventRecord, TicketRecord, TicketTier } from '@/lib/types/database'

export function TicketAdmitCard({
  ticket,
  qr,
  onClose,
}: {
  ticket: TicketRecord & { event?: EventRecord | null; tier?: TicketTier | null; display_status?: string }
  qr?: string
  onClose?: () => void
}) {
  const admitted = isCheckedInTicket(ticket)

  return (
    <Card className="p-6 text-center">
      <h2 className="text-xl font-bold">{ticket.event?.title}</h2>
      {admitted ? (
        <>
          <p className="mt-4 text-lg font-semibold text-primary">{eventWelcomeLine(ticket.event)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This ticket is checked in. The QR code is closed so it cannot be used twice.
          </p>
          <p className="mt-3 text-xs font-semibold uppercase text-primary">Checked in</p>
        </>
      ) : (
        <>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Ticket QR" className="mx-auto mt-4 h-56 w-56 rounded bg-white p-2" />
          )}
          <p className="mt-4 font-mono text-2xl tracking-[0.25em]">{ticket.checkin_code}</p>
          <p className="text-xs text-muted-foreground">Backup check-in code · event access only</p>
          <p className="mt-2 text-xs text-primary">
            {ticket.display_status ?? publicTicketStatus(ticket.status, ticket.event?.end_time)}
          </p>
        </>
      )}
      {onClose && (
        <Button className="mt-4" variant="ghost" onClick={onClose}>
          Close
        </Button>
      )}
    </Card>
  )
}
