import { Resend } from 'resend'
import QRCode from 'qrcode'
import { formatEventDateTime } from '@/lib/datetime'
import { getAppUrl, getResendConfig } from '@/lib/env'
import { BU_BRAND_RED, BU_SITE_NAME } from '@/lib/brand'
import { ticketQrScanString } from '@/lib/tickets/qr-generator'
import type { TicketRecord } from '@/lib/types/database'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function sendTicketEmail(input: {
  to: string
  buyerName: string
  eventTitle: string
  tickets: TicketRecord[]
  when?: string | null
  venue?: string | null
}) {
  const to = input.to.trim()
  const { apiKey, from } = getResendConfig()
  if (!apiKey) {
    console.warn('ticket email skipped: RESEND_API_KEY is not set')
    return { sent: false as const, reason: 'not_configured' }
  }
  if (!EMAIL_RE.test(to) || input.tickets.length === 0) {
    console.warn('ticket email skipped: missing buyer email or tickets', { to, count: input.tickets.length })
    return { sent: false as const, reason: 'invalid' }
  }

  const origin = getAppUrl()
  const attachments: Array<{ filename: string; content: Buffer; contentId: string }> = []
  const rows: string[] = []

  for (const [index, ticket] of input.tickets.entries()) {
    const number = ticket.ticket_number ?? ticket.id
    const code = ticket.checkin_code ?? '—'
    const passUrl = `${origin}/ticket/${ticket.id}`
    const cid = `ticket-qr-${index}`
    try {
      const png = await QRCode.toBuffer(ticketQrScanString(ticket), {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 320,
        color: { dark: '#111111', light: '#ffffff' },
      })
      attachments.push({ filename: `${number}.png`, content: png, contentId: cid })
    } catch (error) {
      console.error('ticket qr attach failed', error)
    }
    rows.push(`<tr>
      <td style="padding:16px 0;border-bottom:1px solid #eee">
        <p style="margin:0 0 8px;font-size:16px;font-weight:700">${escapeHtml(number)}</p>
        <p style="margin:0 0 8px;color:#444">Door code: <strong>${escapeHtml(code)}</strong></p>
        ${attachments.some((item) => item.contentId === cid) ? `<img alt="Ticket QR" src="cid:${cid}" width="160" height="160" style="display:block;margin:12px 0" />` : ''}
        <p style="margin:12px 0 0"><a href="${escapeHtml(passUrl)}" style="color:${BU_BRAND_RED}">Open this ticket on ɃU</a></p>
      </td>
    </tr>`)
  }

  const when = input.when ? escapeHtml(formatEventDateTime(input.when) || input.when) : ''
  const venue = input.venue ? escapeHtml(input.venue) : ''
  const resend = new Resend(apiKey)
  const result = await resend.emails.send({
    from,
    to,
    subject: `Your ${BU_SITE_NAME} ticket for ${input.eventTitle}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#111">
      <p style="letter-spacing:0.2em;text-transform:uppercase;font-size:11px;color:${BU_BRAND_RED};font-weight:700">${escapeHtml(BU_SITE_NAME)}</p>
      <h1 style="font-size:24px;margin:8px 0 16px">You're in, ${escapeHtml(input.buyerName || 'guest')}.</h1>
      <p>Your ticket for <strong>${escapeHtml(input.eventTitle)}</strong> is ready. Show the QR or door code at Access.</p>
      ${when ? `<p style="margin:8px 0 0;color:#444">${when}</p>` : ''}
      ${venue ? `<p style="margin:4px 0 0;color:#444">${venue}</p>` : ''}
      <table width="100%" style="margin-top:16px">${rows.join('')}</table>
      <p style="color:#666;font-size:12px;margin-top:24px">This QR is for event access only. Physical Bison Notes are ceremonial and hold no value.</p>
    </div>`,
    attachments,
  })
  if (result.error) {
    throw new Error(result.error.message)
  }
  return { sent: true as const, id: result.data?.id ?? null }
}
