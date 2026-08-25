import { authenticateMerchant } from '@/lib/api/gateway-auth'
import { ApiError, handleRouteError, successResponse } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EventRecord, TicketRecord, TicketTier } from '@/lib/types/database'

export async function GET(
  request: Request,
  context: { params: Promise<{ event_id: string }> },
) {
  try {
    const merchant = await authenticateMerchant(request)
    const { event_id } = await context.params
    const admin = createAdminClient()
    const { data: event } = await admin.from('events').select('*').eq('id', event_id).maybeSingle()
    if (!event || (event as EventRecord).merchant_id !== merchant.id) {
      throw new ApiError(404, 'NOT_FOUND', 'Event not found')
    }

    const { data: tiers } = await admin.from('ticket_tiers').select('*').eq('event_id', event_id)
    const { data: tickets } = await admin
      .from('tickets')
      .select('*')
      .eq('event_id', event_id)
      .in('status', ['paid', 'checked_in'])

    const list = (tickets as TicketRecord[]) ?? []
    const tierList = (tiers as TicketTier[]) ?? []
    const revenue = list.reduce((sum, ticket) => sum + Number(ticket.amount_paid), 0)
    const checkedIn = list.filter((ticket) => ticket.status === 'checked_in').length

    return successResponse({
      event_id,
      tickets_sold: list.length,
      revenue,
      checkin_rate: list.length ? checkedIn / list.length : 0,
      tiers: tierList.map((tier) => ({
        id: tier.id,
        name: tier.name,
        quantity_total: tier.quantity_total,
        quantity_sold: tier.quantity_sold,
        price: Number(tier.price),
      })),
      attendees: list.map((ticket) => ({
        id: ticket.id,
        email: ticket.buyer_email,
        name: ticket.buyer_name,
        phone: ticket.buyer_phone,
        status: ticket.status,
        checked_in_at: ticket.checked_in_at,
      })),
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
