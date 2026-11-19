import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { canUseVendorMode, getAccountRolesForViewer } from '@/lib/account/roles'
import {
  listEventVendors,
  listVendorEvents,
  normalizeEventRef,
  requestEventVendor,
  setEventVendorStatus,
} from '@/lib/pos/event-vendors'
import { fetchEventRowBySlug, withLiveTiers } from '@/lib/events/live'

const postSchema = z.object({
  action: z.enum(['request', 'approve', 'revoke', 'reject']),
  event_id: z.string().min(1),
  vendor_user_id: z.string().uuid().optional(),
})

async function liveIdFor(user: { id: string; email?: string | null }) {
  const session = await readBuSession()
  return (
    (await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || null,
    })) || user.id
  )
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const liveId = await liveIdFor(user)
    const url = new URL(request.url)
    const eventId = url.searchParams.get('event_id')
    const mine = url.searchParams.get('mine') === '1'

    if (eventId) {
      const vendors = await listEventVendors(eventId)
      return successResponse({ vendors })
    }

    if (mine) {
      const links = await listVendorEvents(liveId, 'all')
      const events = []
      for (const link of links) {
        const row = await fetchEventRowBySlug(link.event_id)
        if (!row) continue
        const packed = withLiveTiers(row)
        events.push({
          ...link,
          event_title: packed.title,
          event_start: packed.start_time,
          venue_name: packed.venue_name,
          venue_address: packed.venue_address,
          organizer_name: packed.organizer_name,
          cover_image_url: packed.cover_image_url,
        })
      }
      return successResponse({ links: events })
    }

    throw new ApiError(400, 'VALIDATION_ERROR', 'Pass event_id or mine=1')
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const session = await readBuSession()
    const liveId = await liveIdFor(user)
    const roles = await getAccountRolesForViewer(liveId, session)
    const body = postSchema.parse(await request.json())

    const eventId = normalizeEventRef(body.event_id)
    if (!eventId) throw new ApiError(400, 'VALIDATION_ERROR', 'event_id required')

    if (body.action === 'request') {
      if (!canUseVendorMode(roles)) {
        throw new ApiError(403, 'FORBIDDEN', 'Vendor role required. Ask Super Admin to make you a vendor.')
      }
      const eventRow = await fetchEventRowBySlug(eventId)
      if (!eventRow) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Event not found')
      const packed = withLiveTiers(eventRow)
      if (packed.vendors_invite_enabled === false) {
        throw new ApiError(403, 'VENDORS_CLOSED', 'This event is not inviting vendors right now.')
      }
      const row = await requestEventVendor(eventId, liveId)
      return successResponse(row, 'Join request sent — organiser will approve or reject')
    }

    const vendorId = body.vendor_user_id
    if (!vendorId) throw new ApiError(400, 'VALIDATION_ERROR', 'vendor_user_id required')
    const status = body.action === 'approve' ? 'approved' : 'revoked'
    const row = await setEventVendorStatus(eventId, vendorId, status, liveId)
    return successResponse(
      row,
      status === 'approved'
        ? 'Vendor approved'
        : body.action === 'reject'
          ? 'Vendor rejected'
          : 'Vendor revoked',
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
