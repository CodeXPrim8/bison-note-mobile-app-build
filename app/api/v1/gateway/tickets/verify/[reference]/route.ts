import { authenticateMerchant } from '@/lib/api/gateway-auth'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { verifyReference } from '@/lib/payments/verify'
import { assertMerchantOwnsEvent, merchantLiveUserId } from '@/lib/gateway/merchant'
import { applyGatewayCors, gatewayOptions } from '@/lib/gateway/initialize'
import type { TicketRecord } from '@/lib/types/database'

export async function OPTIONS(request: Request) {
  return gatewayOptions(request)
}

export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  try {
    const merchant = await authenticateMerchant(request)
    const { reference } = await context.params
    const result = await verifyReference(reference)
    const tickets = (result.tickets ?? []) as TicketRecord[]
    const eventId = result.payment?.event_id || tickets[0]?.event_id
    if (eventId) {
      await assertMerchantOwnsEvent(merchant, eventId)
    } else {
      const owner = await merchantLiveUserId(merchant)
      if (result.payment?.user_id && result.payment.user_id !== owner) {
        throw new ApiError(404, 'NOT_FOUND', 'Transaction not found')
      }
    }

    const extra = result as typeof result & { event_title?: string; callback_url?: string | null }
    const amount = Number(result.payment?.amount ?? tickets.reduce((sum, ticket) => sum + Number(ticket.amount_paid), 0))
    const response = successResponse({
      status: result.payment?.status === 'success' || tickets.length ? 'success' : 'pending',
      reference,
      amount,
      currency: 'NGN',
      paid_at: result.payment?.fulfilled_at ?? tickets[0]?.created_at ?? null,
      customer: {
        email: result.payment?.buyer_email || tickets[0]?.buyer_email || '',
        name: result.payment?.buyer_name || tickets[0]?.buyer_name || null,
        phone: result.payment?.buyer_phone || tickets[0]?.buyer_phone || null,
      },
      event: eventId
        ? { id: eventId, title: extra.event_title ?? null }
        : null,
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        event_id: ticket.event_id,
        checkin_code: ticket.checkin_code,
        status: ticket.status,
      })),
      callback_url: extra.callback_url ?? result.payment?.callback_url ?? null,
    })
    return applyGatewayCors(response, request, merchant)
  } catch (error) {
    return handleRouteError(error)
  }
}
