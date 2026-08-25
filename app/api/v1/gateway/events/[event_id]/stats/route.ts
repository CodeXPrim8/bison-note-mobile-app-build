import { authenticateMerchant } from '@/lib/api/gateway-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError, handleRouteError, successResponse } from '@/lib/api/errors'
import type { EventRecord, TicketRecord, TicketTier } from '@/lib/types/database'

export async function GET(request: Request, context: { params: Promise<{ event_id: string }> }) {
  try {
    const merchant = await authenticateMerchant(request)
    const { event_id } = await context.params
    const admin = createAdminClient()
    const { data: event } = await admin.from('events').select('*').eq('id', event_id).maybeSingle()
    if (!event || (event as EventRecord).merchant_id !== merchant.id) {
      throw new ApiError(404, 'NOT_FOUND', 'Event not found')
    }
    const [{ data: tiers }, { data: tickets }] = await Promise.all([
      admin.from('ticket_tiers').select('*').eq('event_id', event_id),
      admin.from('tickets').select('*').eq('event_id', event_id).in('status', ['paid', 'checked_in']),
    ])
    const paid = (tickets as TicketRecord[]) ?? []
    return successResponse({
      event_id,
      tickets_sold: paid.length,
      revenue: paid.reduce((sum, t) => sum + Number(t.amount_paid), 0),
      checked_in: paid.filter((t) => t.status === 'checked_in').length,
      tiers: ((tiers as TicketTier[]) ?? []).map((tier) => ({
        id: tier.id,
        name: tier.name,
        sold: tier.quantity_sold,
        remaining: tier.quantity_total - tier.quantity_sold,
      })),
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
