import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { quoteTicketSchema } from '@/lib/schemas/ticket'
import { quoteTicketTotal } from '@/lib/money'
import { createDataClient } from '@/lib/supabase/data'
import { fetchEventRowBySlug, fetchLiveTierPrice, liveRemaining, parseLiveTierId, withLiveTiers } from '@/lib/events/live'
import { isEventUpcoming } from '@/lib/events/sale'
import type { EventRecord, TicketTier } from '@/lib/types/database'

export async function POST(request: Request) {
  try {
    const body = quoteTicketSchema.parse(await request.json())
    const liveTier = await fetchLiveTierPrice(body.ticket_tier_id)
    if (liveTier) {
      const eventId = parseLiveTierId(body.ticket_tier_id)
      if (eventId) {
        const row = await fetchEventRowBySlug(eventId)
        if (row && !isEventUpcoming(withLiveTiers(row))) {
          throw new ApiError(409, 'EVENT_ENDED', 'This event has ended')
        }
      }
      const remaining = liveRemaining(liveTier)
      if (!liveTier.is_active) {
        throw new ApiError(409, 'EVENT_NOT_ON_SALE', 'Event is not on sale')
      }
      if (remaining < body.quantity) {
        throw new ApiError(409, 'TIER_SOLD_OUT', 'Ticket tier is sold out', {
          tier_id: liveTier.id,
          available: remaining,
        })
      }
      return successResponse({
        ...quoteTicketTotal(Number(liveTier.price), body.quantity),
        currency: 'NGN',
        tier_name: liveTier.name,
        remaining,
      })
    }

    const db = createDataClient()
    const { data } = await db.from('ticket_tiers').select('*').eq('id', body.ticket_tier_id).maybeSingle()
    if (!data) throw new ApiError(404, 'TIER_NOT_FOUND', 'Ticket tier not found')
    const tier = data as TicketTier
    const eventRow = await db.from('events').select('*').eq('id', tier.event_id).maybeSingle()
    if (eventRow.data && !isEventUpcoming(eventRow.data as EventRecord)) {
      throw new ApiError(409, 'EVENT_ENDED', 'This event has ended')
    }
    const remaining = liveRemaining(tier)
    if (remaining < body.quantity) {
      throw new ApiError(409, 'TIER_SOLD_OUT', 'Ticket tier is sold out', {
        tier_id: tier.id,
        available: remaining,
      })
    }
    return successResponse({
      ...quoteTicketTotal(Number(tier.price), body.quantity),
      currency: 'NGN',
      tier_name: tier.name,
      remaining,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
