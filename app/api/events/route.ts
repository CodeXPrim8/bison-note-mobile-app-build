import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { createEventSchema } from '@/lib/schemas/event'
import { requireUser } from '@/lib/api/session'
import { auditFromRequest } from '@/lib/api/audit-request'
import { isSupabaseConfigured } from '@/lib/env'
import { readBuSession } from '@/lib/auth/bu-session'
import {
  fetchPublicEventRows,
  insertLiveEvent,
  resolveLiveCelebrantId,
  withLiveTiers,
} from '@/lib/events/live'
import { isPublicCatalogEvent } from '@/lib/events/access'

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return successResponse([])
    }
    const rows = await fetchPublicEventRows()
    const list = rows.map(withLiveTiers).filter(isPublicCatalogEvent)
    return successResponse(list)
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
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
    const json: unknown = await request.json()
    const body = createEventSchema.parse(json)
    const firstTier = body.ticket_tiers[0]
    const created = await insertLiveEvent(celebrantId, {
      title: body.title,
      start_time: body.start_time,
      venue_name: body.venue_name,
      venue_address: body.venue_address,
      description: body.description,
      cover_image_url: body.cover_image_url,
      visibility: body.visibility,
      category: body.category,
      capacity: body.capacity ?? firstTier?.quantity_total,
      ticket_price_bu: firstTier?.price,
      max_tickets: body.ticket_tiers.reduce((sum, tier) => sum + (tier.quantity_total || 0), 0),
    })

    if ('error' in created) {
      throw new ApiError(
        503,
        'EVENT_CREATE_FAILED',
        created.error ||
          'Could not save this event on the live ɃU database. Run supabase/migrations/0008_bu_live_events.sql in the ɃU Supabase SQL editor, or add that project’s service_role key.',
      )
    }

    await auditFromRequest(request, { actorUserId: user.id, statusCode: 201 })
    const packed = withLiveTiers(created.row)
    return successResponse({ event_id: packed.id, slug: packed.slug, visibility: packed.visibility }, 'Event created', 201)
  } catch (error) {
    return handleRouteError(error)
  }
}
