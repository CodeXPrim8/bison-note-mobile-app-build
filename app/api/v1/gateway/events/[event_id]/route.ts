import { authenticateMerchant } from '@/lib/api/gateway-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError, handleRouteError, successResponse } from '@/lib/api/errors'
import type { EventRecord, TicketRecord, TicketTier } from '@/lib/types/database'

export async function GET(_request: Request, context: { params: Promise<{ event_id: string }> }) {
  try {
    const merchant = await authenticateMerchant(_request)
    const { event_id } = await context.params
    const admin = createAdminClient()
    const { data: event } = await admin.from('events').select('*').eq('id', event_id).maybeSingle()
    if (!event || (event as EventRecord).merchant_id !== merchant.id) {
      throw new ApiError(404, 'NOT_FOUND', 'Event not found')
    }
    const { data: tiers } = await admin.from('ticket_tiers').select('*').eq('event_id', event_id)
    return successResponse({ ...(event as EventRecord), ticket_tiers: (tiers as TicketTier[]) ?? [] })
  } catch (error) {
    return handleRouteError(error)
  }
}
