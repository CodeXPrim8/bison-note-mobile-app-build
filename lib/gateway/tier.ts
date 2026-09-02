import { ApiError } from '@/lib/api/errors'
import { fetchEventRowBySlug, withLiveTiers } from '@/lib/events/live'
import { liveTierId, parseLiveTierId, parseLiveTierKey } from '@/lib/events/ticket-types'

export async function resolveGatewayTicketTierId(input: {
  ticket_tier_id?: string
  event_id?: string
  ticket_type?: string
}): Promise<string> {
  if (input.ticket_tier_id && parseLiveTierId(input.ticket_tier_id)) {
    if (!input.ticket_type) return input.ticket_tier_id
    const eventId = parseLiveTierId(input.ticket_tier_id)!
    return liveTierId(eventId, input.ticket_type)
  }

  const eventRef = input.event_id || input.ticket_tier_id
  if (!eventRef) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Pass event_id or ticket_tier_id')
  }

  const row = await fetchEventRowBySlug(eventRef)
  if (!row) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found')
  const packed = withLiveTiers(row)
  const typeKey = (input.ticket_type || '').trim().toLowerCase()

  if (typeKey) {
    const found = packed.ticket_tiers.find(
      (tier) => parseLiveTierKey(tier.id) === typeKey || tier.id === liveTierId(packed.id, typeKey),
    )
    if (!found) throw new ApiError(404, 'TIER_NOT_FOUND', 'Ticket type not found for this event')
    return found.id
  }

  const first = packed.ticket_tiers[0]
  if (!first) throw new ApiError(404, 'TIER_NOT_FOUND', 'This event has no ticket types')
  return first.id
}
