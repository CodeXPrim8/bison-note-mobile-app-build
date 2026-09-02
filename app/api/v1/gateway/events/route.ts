import { authenticateMerchant } from '@/lib/api/gateway-auth'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { gatewayCreateEventSchema } from '@/lib/schemas/event'
import { insertLiveEvent, withLiveTiers } from '@/lib/events/live'
import { storedTypesFromInput } from '@/lib/events/ticket-types'
import { listMerchantEvents, merchantLiveUserId, serializeGatewayEvent } from '@/lib/gateway/merchant'
import { applyGatewayCors, gatewayOptions } from '@/lib/gateway/initialize'
import { getUserControl } from '@/lib/admin/platform'
import { enableAccountRole } from '@/lib/account/roles'

export async function OPTIONS(request: Request) {
  return gatewayOptions(request)
}

export async function GET(request: Request) {
  try {
    const merchant = await authenticateMerchant(request)
    const events = await listMerchantEvents(merchant)
    const response = successResponse(events)
    return applyGatewayCors(response, request, merchant)
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const merchant = await authenticateMerchant(request)
    const ownerId = await merchantLiveUserId(merchant)
    const control = await getUserControl(ownerId)
    if (control.suspended || control.deleted_at || control.organizer_suspended) {
      throw new ApiError(403, 'ORGANIZER_SUSPENDED', 'This organiser is suspended and cannot publish events.')
    }

    const json: unknown = await request.json()
    const body = gatewayCreateEventSchema.parse(json)
    const firstTier = body.ticket_tiers[0]
    const ticketTypes = storedTypesFromInput(body.ticket_tiers)
    const created = await insertLiveEvent(ownerId, {
      title: body.title,
      start_time: body.start_time,
      venue_name: body.venue_name,
      venue_address: body.venue_address,
      description: body.description,
      cover_image_url: body.cover_image_url,
      visibility: body.visibility,
      category: body.category,
      capacity: body.capacity ?? body.ticket_tiers.reduce((sum, tier) => sum + (tier.quantity_total || 0), 0),
      ticket_price_bu: firstTier?.price,
      max_tickets: body.ticket_tiers.reduce((sum, tier) => sum + (tier.quantity_total || 0), 0),
      ticket_types: ticketTypes,
      organizer_name: body.organizer_name,
      organizer_info: body.organizer_info,
      end_time: body.end_time,
      venue_lat: body.venue_lat,
      venue_lng: body.venue_lng,
      contact_email: body.contact_email,
      contact_phone: body.contact_phone,
      ticket_sales_start: body.ticket_sales_start,
      ticket_sales_end: body.ticket_sales_end,
      affiliate_enabled: body.affiliate_enabled,
      affiliate_commission_pct: body.affiliate_commission_pct,
    })

    if ('error' in created) {
      throw new ApiError(503, 'EVENT_CREATE_FAILED', created.error || 'Could not create this event')
    }

    await enableAccountRole(ownerId, 'organizer').catch(() => undefined)
    const packed = withLiveTiers(created.row)
    const response = successResponse(serializeGatewayEvent(packed), 'Event created', 201)
    return applyGatewayCors(response, request, merchant)
  } catch (error) {
    return handleRouteError(error)
  }
}
