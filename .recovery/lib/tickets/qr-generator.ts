import QRCode from 'qrcode'

export interface TicketQrPayload {
  type: 'bu_ticket'
  ticket_id: string
  event_id: string
  checkin_code: string
}

export function ticketQrPayload(input: Omit<TicketQrPayload, 'type'>): string {
  return JSON.stringify({ type: 'bu_ticket', ...input } satisfies TicketQrPayload)
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
  try {
    const parsed = JSON.parse(raw) as TicketQrPayload
    if (parsed.type !== 'bu_ticket' || !parsed.ticket_id || !parsed.checkin_code) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}
