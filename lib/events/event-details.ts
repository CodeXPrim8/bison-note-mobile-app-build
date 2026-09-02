import { EVENT_FORM_SIDECAR_KEY } from '@/lib/events/ticket-types'

export type EventFormDetails = {
  organizer_name: string | null
  organizer_info: string | null
  end_time: string | null
  venue_name: string | null
  venue_address: string | null
  venue_lat: number | null
  venue_lng: number | null
  contact_email: string | null
  contact_phone: string | null
  ticket_sales_start: string | null
  ticket_sales_end: string | null
  affiliate_enabled: boolean
  affiliate_commission_pct: number
}

function asTrimmed(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

function asCoord(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function asIso(value: unknown): string | null {
  const text = asTrimmed(value)
  if (!text) return null
  const time = new Date(text).getTime()
  return Number.isFinite(time) ? new Date(time).toISOString() : text
}

function asFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function asPct(value: unknown, fallback = 10): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(80, Math.max(0, Math.round(n * 100) / 100))
}

export function emptyEventFormDetails(): EventFormDetails {
  return {
    organizer_name: null,
    organizer_info: null,
    end_time: null,
    venue_name: null,
    venue_address: null,
    venue_lat: null,
    venue_lng: null,
    contact_email: null,
    contact_phone: null,
    ticket_sales_start: null,
    ticket_sales_end: null,
    affiliate_enabled: false,
    affiliate_commission_pct: 10,
  }
}

export function buildEventFormDetails(input: Partial<EventFormDetails>): EventFormDetails {
  return {
    organizer_name: asTrimmed(input.organizer_name),
    organizer_info: asTrimmed(input.organizer_info),
    end_time: asIso(input.end_time),
    venue_name: asTrimmed(input.venue_name),
    venue_address: asTrimmed(input.venue_address),
    venue_lat: asCoord(input.venue_lat),
    venue_lng: asCoord(input.venue_lng),
    contact_email: asTrimmed(input.contact_email),
    contact_phone: asTrimmed(input.contact_phone),
    ticket_sales_start: asIso(input.ticket_sales_start),
    ticket_sales_end: asIso(input.ticket_sales_end),
    affiliate_enabled: asFlag(input.affiliate_enabled),
    affiliate_commission_pct: asPct(input.affiliate_commission_pct),
  }
}

export function eventFormDetailsHasValues(details: EventFormDetails): boolean {
  return Object.values(details).some((value) => value != null && value !== '')
}

function parseDetailsObject(raw: unknown): EventFormDetails | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  return buildEventFormDetails({
    organizer_name: row.organizer_name as string | null,
    organizer_info: row.organizer_info as string | null,
    end_time: row.end_time as string | null,
    venue_name: row.venue_name as string | null,
    venue_address: row.venue_address as string | null,
    venue_lat: row.venue_lat as number | null,
    venue_lng: row.venue_lng as number | null,
    contact_email: row.contact_email as string | null,
    contact_phone: row.contact_phone as string | null,
    ticket_sales_start: row.ticket_sales_start as string | null,
    ticket_sales_end: row.ticket_sales_end as string | null,
    affiliate_enabled: asFlag(row.affiliate_enabled),
    affiliate_commission_pct: asPct(row.affiliate_commission_pct),
  })
}

function parseTicketTypesArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function parseEventFormDetails(row: Record<string, unknown>): EventFormDetails {
  const fromColumn = parseDetailsObject(row.details)
  if (fromColumn && eventFormDetailsHasValues(fromColumn)) return fromColumn

  const sidecar = parseTicketTypesArray(row.ticket_types).find((item) => {
    if (!item || typeof item !== 'object') return false
    const entry = item as Record<string, unknown>
    return String(entry.key ?? '').trim().toLowerCase() === EVENT_FORM_SIDECAR_KEY
  }) as Record<string, unknown> | undefined
  const fromSidecar = parseDetailsObject(sidecar?.details)
  if (fromSidecar) return fromSidecar

  return fromColumn ?? emptyEventFormDetails()
}

export function eventVenueLabel(event?: { venue_name?: string | null; venue_address?: string | null } | null) {
  const name = event?.venue_name?.trim() || ''
  const address = event?.venue_address?.trim() || ''
  if (name && address && name !== address) return `${name} · ${address}`
  return name || address
}

export function withFormSidecar<T extends { key: string }>(types: T[], details: EventFormDetails): unknown[] {
  return [
    ...types,
    { key: EVENT_FORM_SIDECAR_KEY, details },
  ]
}
