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
import { storedTypesFromInput } from '@/lib/events/ticket-types'
import { isPublicCatalogEvent } from '@/lib/events/access'
import { enableAccountRole } from '@/lib/account/roles'
import { getUserControl, listUserControls } from '@/lib/admin/platform'

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return successResponse([])
    }
    const rows = await fetchPublicEventRows()
    const controls = await listUserControls()
    const blocked = new Set(
      controls.filter((row) => row.organizer_suspended || row.suspended || row.deleted_at).map((row) => row.user_id),
    )
    const list = rows
      .map(withLiveTiers)
      .filter(isPublicCatalogEvent)
      .filter((event) => !blocked.has(event.organizer_id))
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
    const control = await getUserControl(celebrantId)
    if (control.suspended || control.deleted_at || control.organizer_suspended) {
      throw new ApiError(403, 'ORGANIZER_SUSPENDED', 'This organiser is suspended and cannot publish events.')
    }
    const json: unknown = await request.json()
    const body = createEventSchema.parse(json)
    const firstTier = body.ticket_tiers[0]
    const ticketTypes = storedTypesFromInput(body.ticket_tiers)
    const created = await insertLiveEvent(celebrantId, {
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
      throw new ApiError(
        503,
        'EVENT_CREATE_FAILED',
        created.error ||
          'Could not save this event on the live ɃU database. Run supabase/migrations/0008_bu_live_events.sql in the ɃU Supabase SQL editor, or add that project’s service_role key.',
      )
    }

    await enableAccountRole(celebrantId, 'organizer').catch(() => undefined)
    await auditFromRequest(request, { actorUserId: user.id, statusCode: 201 })
    const packed = withLiveTiers(created.row)
    return successResponse({ event_id: packed.id, slug: packed.slug, visibility: packed.visibility }, 'Event created', 201)
  } catch (error) {
    return handleRouteError(error)
  }
}
