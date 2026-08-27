import type { TicketTier } from '@/lib/types/database'

export function ticketsRemaining(tiers: Pick<TicketTier, 'quantity_total' | 'quantity_sold'>[] | undefined) {
  return (tiers ?? []).reduce(
    (sum, tier) => sum + Math.max(0, Number(tier.quantity_total) - Number(tier.quantity_sold)),
    0,
  )
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

export function isEventPast(event: { start_time: string; end_time?: string | null } | null | undefined) {
  return Boolean(event?.start_time) && !isEventUpcoming(event)
}
