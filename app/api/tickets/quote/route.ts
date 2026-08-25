import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { quoteTicketSchema } from '@/lib/schemas/ticket'
import { quoteTicketTotal } from '@/lib/money'
import { createDataClient } from '@/lib/supabase/data'
import { fetchLiveTierPrice } from '@/lib/events/live'
import type { TicketTier } from '@/lib/types/database'

export async function POST(request: Request) {
  try {
    const body = quoteTicketSchema.parse(await request.json())
    const liveTier = await fetchLiveTierPrice(body.ticket_tier_id)
    if (liveTier) {
      return successResponse({
        ...quoteTicketTotal(Number(liveTier.price), body.quantity),
        currency: 'NGN',
        tier_name: liveTier.name,
      })
    }

    const db = createDataClient()
    const { data } = await db.from('ticket_tiers').select('*').eq('id', body.ticket_tier_id).maybeSingle()
    if (!data) throw new ApiError(404, 'TIER_NOT_FOUND', 'Ticket tier not found')
    const tier = data as TicketTier
    return successResponse({
      ...quoteTicketTotal(Number(tier.price), body.quantity),
      currency: 'NGN',
      tier_name: tier.name,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
