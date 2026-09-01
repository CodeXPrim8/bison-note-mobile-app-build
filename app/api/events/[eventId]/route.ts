import { ApiError, handleRouteError, successResponse } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { updateEventSchema } from '@/lib/schemas/event'
import { auditFromRequest } from '@/lib/api/audit-request'
import { readBuSession } from '@/lib/auth/bu-session'
import { fetchLiveEventDashboard, resolveLiveCelebrantId, updateLiveEvent, withLiveTiers } from '@/lib/events/live'

export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    const user = await requireUser()
    const { eventId } = await context.params
    const dash = await fetchLiveEventDashboard(eventId, user.id)
    if (!dash) throw new ApiError(404, 'NOT_FOUND', 'Event not found')
    if ('forbidden' in dash) throw new ApiError(403, 'FORBIDDEN', 'Not the organizer')
    return successResponse(dash)
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    const user = await requireUser()
    const session = await readBuSession()
    const celebrantId = await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || null,
    })
    if (!celebrantId) {
      throw new ApiError(
        403,
        'NOT_LIVE_USER',
        'This signed-in account is not a live ɃU user. Sign out, then sign in with your ɃU ID (phone number) and PIN from the live ɃU app.',
      )
    }
    const { eventId } = await context.params
    const body = updateEventSchema.parse(await request.json())
    const firstTier = body.ticket_tiers[0]
    const updated = await updateLiveEvent(eventId, celebrantId, {
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
      ticket_types: body.ticket_tiers,
      organizer_name: body.organizer_name,
      organizer_info: body.organizer_info,
      end_time: body.end_time,
      venue_lat: body.venue_lat,
      venue_lng: body.venue_lng,
      contact_email: body.contact_email,
      contact_phone: body.contact_phone,
      ticket_sales_start: body.ticket_sales_start,
      ticket_sales_end: body.ticket_sales_end,
    })

    if ('error' in updated) {
      if (updated.code === 'NOT_FOUND') throw new ApiError(404, 'NOT_FOUND', updated.error)
      if (updated.code === 'FORBIDDEN') throw new ApiError(403, 'FORBIDDEN', updated.error)
      if (updated.code === 'VALIDATION') throw new ApiError(400, 'VALIDATION_ERROR', updated.error)
      throw new ApiError(503, 'EVENT_UPDATE_FAILED', updated.error)
    }

    await auditFromRequest(request, { actorUserId: user.id, statusCode: 200 })
    const packed = withLiveTiers(updated.row)
    return successResponse({ event_id: packed.id, slug: packed.slug, visibility: packed.visibility }, 'Event updated')
  } catch (error) {
    return handleRouteError(error)
  }
}
