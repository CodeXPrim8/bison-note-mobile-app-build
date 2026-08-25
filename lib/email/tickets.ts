import { Resend } from 'resend'
import { getResendConfig } from '@/lib/env'
import { ticketQrDataUrl } from '@/lib/tickets/qr-generator'
import type { TicketRecord } from '@/lib/types/database'

export async function sendTicketEmail(input: {
  to: string
  buyerName: string
  eventTitle: string
  tickets: TicketRecord[]
}) {
  const { apiKey, from } = getResendConfig()
  if (!apiKey || input.tickets.length === 0) return

  const items = await Promise.all(
    input.tickets.map(async (ticket) => {
      const qr = ticket.qr_code_data ? await ticketQrDataUrl(ticket.qr_code_data) : ''
      return `<tr>
        <td style="padding:12px;border-bottom:1px solid #eee">
          <p><strong>${ticket.ticket_number ?? ticket.id}</strong></p>
          <p><strong>Check-in code:</strong> ${ticket.checkin_code ?? '—'}</p>
          ${qr ? `<img alt="Ticket QR" src="${qr}" width="160" height="160" />` : ''}
        </td>
      </tr>`
    }),
  )

  const resend = new Resend(apiKey)
  await resend.emails.send({
    from,
    to: input.to,
    subject: `Your ɃU tickets for ${input.eventTitle}`,
    html: `<div style="font-family:sans-serif;max-width:480px">
      <h1>You're in, ${input.buyerName}.</h1>
      <p>Here are your tickets for <strong>${input.eventTitle}</strong>.</p>
      <table width="100%">${items.join('')}</table>
      <p style="color:#666;font-size:12px">Ticket QR codes are for event access only. Physical Bison Notes are ceremonial and hold no value.</p>
    </div>`,
  })
}
