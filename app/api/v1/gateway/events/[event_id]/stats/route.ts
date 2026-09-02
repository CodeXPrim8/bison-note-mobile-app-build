import { authenticateMerchant } from '@/lib/api/gateway-auth'
import { handleRouteError, successResponse } from '@/lib/api/errors'
import { assertMerchantOwnsEvent } from '@/lib/gateway/merchant'
import { fetchTicketsForEvents, liveRemaining } from '@/lib/events/live'
import { parseLiveTierKey } from '@/lib/events/ticket-types'
import { applyGatewayCors, gatewayOptions } from '@/lib/gateway/initialize'

export async function OPTIONS(request: Request) {
  return gatewayOptions(request)
}

export async function GET(request: Request, context: { params: Promise<{ event_id: string }> }) {
  try {
    const merchant = await authenticateMerchant(request)
    const { event_id } = await context.params
    const packed = await assertMerchantOwnsEvent(merchant, event_id)
    const tickets = await fetchTicketsForEvents([packed.id])
    const paid = tickets.filter((ticket) => ticket.status !== 'cancelled' && ticket.status !== 'refunded')
    const response = successResponse({
      event_id: packed.id,
      tickets_sold: paid.length,
      revenue: paid.reduce((sum, ticket) => sum + Number(ticket.amount_paid), 0),
      checked_in: paid.filter((ticket) => ticket.status === 'checked_in').length,
      ticket_types: packed.ticket_tiers.map((tier) => ({
        id: tier.id,
        ticket_type: parseLiveTierKey(tier.id),
        name: tier.name,
        sold: Number(tier.quantity_sold),
        remaining: liveRemaining(tier),
      })),
    })
    return applyGatewayCors(response, request, merchant)
  } catch (error) {
    return handleRouteError(error)
  }
}
