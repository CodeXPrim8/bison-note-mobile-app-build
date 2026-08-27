import QRCode from 'qrcode'

export interface TicketQrPayload {
  type: 'bu_ticket'
  ticket_id: string
  event_id: string
  checkin_code: string
  qr_token?: string
  pay_ref?: string
}

const LIVE_PAY_REF = /BU_LIVE_[A-Z0-9]{10,}/i

export function extractLivePayRef(raw: string | null | undefined): string | null {
  if (!raw) return null
  const match = raw.match(LIVE_PAY_REF)
  return match ? match[0].toUpperCase() : null
}

export function ticketQrPayload(input: Omit<TicketQrPayload, 'type'>): string {
  const payload: TicketQrPayload = {
    type: 'bu_ticket',
    ticket_id: input.ticket_id,
    event_id: input.event_id,
    checkin_code: input.checkin_code,
  }
  if (input.pay_ref) payload.pay_ref = input.pay_ref
  return JSON.stringify(payload)
}

export function ticketQrScanString(input: {
  id?: string | null
  event_id?: string | null
  checkin_code?: string | null
  qr_code_data?: string | null
  payment_id?: string | null
}): string {
  const parsed = input.qr_code_data ? parseTicketQr(input.qr_code_data) : null
  const ticketId = parsed?.ticket_id || input.id || ''
  const eventId = parsed?.event_id || input.event_id || ''
  const checkin = parsed?.checkin_code || input.checkin_code || ''
  const payRef = parsed?.pay_ref || extractLivePayRef(input.qr_code_data) || input.payment_id || undefined
  if (ticketId && eventId && checkin) {
    return ticketQrPayload({ ticket_id: ticketId, event_id: eventId, checkin_code: checkin, pay_ref: payRef })
  }
  return input.qr_code_data || ticketQrPayload({ ticket_id: ticketId, event_id: eventId, checkin_code: checkin, pay_ref: payRef })
}

export async function ticketQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: { dark: '#111111', light: '#ffffff' },
  })
}

export function parseTicketQr(raw: string): TicketQrPayload | null {
  const payRef = extractLivePayRef(raw)
  try {
    const parsed = JSON.parse(raw) as Partial<TicketQrPayload> & Record<string, unknown>
    const ticketId = String(parsed.ticket_id ?? parsed.id ?? '')
    const eventId = String(parsed.event_id ?? parsed.e ?? '')
    const checkin = String(parsed.checkin_code ?? parsed.c ?? '')
    const type = parsed.type == null ? 'bu_ticket' : String(parsed.type)
    if (type !== 'bu_ticket') return null
    const ref = payRef || (parsed.pay_ref ? String(parsed.pay_ref) : undefined)
    if (!ticketId && !checkin && !ref) return null
    return {
      type: 'bu_ticket',
      ticket_id: ticketId,
      event_id: eventId,
      checkin_code: checkin,
      qr_token: parsed.qr_token ? String(parsed.qr_token) : undefined,
      pay_ref: ref,
    }
  } catch {
    if (!payRef) return null
    return {
      type: 'bu_ticket',
      ticket_id: '',
      event_id: '',
      checkin_code: '',
      pay_ref: payRef,
    }
  }
}
