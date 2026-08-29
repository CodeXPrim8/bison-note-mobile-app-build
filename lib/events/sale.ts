import type { TicketTier } from '@/lib/types/database'

export function ticketsRemaining(tiers: Pick<TicketTier, 'quantity_total' | 'quantity_sold'>[] | undefined) {
  return (tiers ?? []).reduce(
    (sum, tier) => sum + Math.max(0, Number(tier.quantity_total) - Number(tier.quantity_sold)),
    0,
  )
}

export function listingRemaining(event: {
  tickets_available?: number
  ticket_tiers?: Pick<TicketTier, 'quantity_total' | 'quantity_sold'>[]
}) {
  if (typeof event.tickets_available === 'number') return event.tickets_available
  return ticketsRemaining(event.ticket_tiers)
}

export function eventOnSale(
  tiers: Array<Pick<TicketTier, 'quantity_total' | 'quantity_sold'> & { is_active?: boolean }> | undefined,
) {
  return (tiers ?? []).some(
    (tier) => tier.is_active !== false && Math.max(0, Number(tier.quantity_total) - Number(tier.quantity_sold)) > 0,
  )
}

export function appCheckoutPath(slug: string) {
  return `/checkout/${encodeURIComponent(slug)}?from=app`
}

/** ɃU event dates are Nigeria local days (WAT, UTC+1). */
const LAGOS_OFFSET_MS = 60 * 60 * 1000

/** When the event is over: use end time, otherwise the end of its party date in Nigeria. */
export function eventEndsAt(event: { start_time: string; end_time?: string | null }): Date {
  if (event.end_time) {
    const end = new Date(event.end_time)
    if (Number.isFinite(end.getTime())) return end
  }
  const start = new Date(event.start_time)
  if (!Number.isFinite(start.getTime())) return new Date(0)
  const inLagos = new Date(start.getTime() + LAGOS_OFFSET_MS)
  const y = inLagos.getUTCFullYear()
  const m = inLagos.getUTCMonth()
  const d = inLagos.getUTCDate()
  return new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - LAGOS_OFFSET_MS)
}

export function isEventUpcoming(event: { start_time: string; end_time?: string | null } | null | undefined) {
  if (!event?.start_time) return false
  return eventEndsAt(event).getTime() >= Date.now()
}

/** True while the printed event date (this device) has not passed. Used for Upcoming lists. */
export function isUpcomingListingEvent(event: { start_time: string; end_time?: string | null } | null | undefined) {
  return Boolean(event?.start_time) && !eventDateHasPassed(event)
}

export function isEventPast(event: { start_time: string; end_time?: string | null } | null | undefined) {
  return Boolean(event?.start_time) && !isEventUpcoming(event)
}

/** End of the start date on this device — matches the date printed on event cards. */
export function eventDateHasPassed(event: { start_time: string; end_time?: string | null } | null | undefined) {
  if (event?.end_time) {
    const end = new Date(event.end_time)
    if (Number.isFinite(end.getTime())) return end.getTime() < Date.now()
  }
  if (!event?.start_time) return true
  const start = new Date(event.start_time)
  if (!Number.isFinite(start.getTime())) return true
  const endOfLocalDay = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999)
  return endOfLocalDay.getTime() < Date.now()
}

export function eventListingStatus(
  event: { start_time: string; end_time?: string | null } | null | undefined,
  remaining?: number,
): 'ended' | 'sold_out' | 'available' {
  if (eventDateHasPassed(event)) return 'ended'
  if (typeof remaining === 'number' && remaining <= 0) return 'sold_out'
  return 'available'
}

export function listingStockLabel(
  event: { start_time: string; end_time?: string | null } | null | undefined,
  remaining?: number,
) {
  const status = eventListingStatus(event, remaining)
  if (status === 'ended') return 'Event ended'
  if (status === 'sold_out') return 'Sold out'
  if (typeof remaining === 'number') return `${remaining} tickets left`
  return 'Check availability'
}

export function isCheckedInTicket(ticket: { status?: string | null; checked_in_at?: string | null } | null | undefined) {
  return ticket?.status === 'checked_in' || Boolean(ticket?.checked_in_at)
}

export function eventWelcomeLine(event?: { title?: string | null; category?: string | null } | null) {
  const hay = `${event?.category ?? ''} ${event?.title ?? ''}`
  if (/party|night|club|concert|wedding|birthday/i.test(hay)) {
    return "You're in — enjoy the party!"
  }
  return "You're in — enjoy the event!"
}
