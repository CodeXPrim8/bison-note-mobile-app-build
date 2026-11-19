import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { writeAdminAudit } from '@/lib/admin/platform'
import { listEventVendors, setEventVendorStatus } from '@/lib/pos/event-vendors'

const patchSchema = z.object({
  event_id: z.string().min(1),
  vendor_user_id: z.string().uuid(),
  status: z.enum(['approved', 'revoked', 'pending']),
})

export async function GET(request: Request) {
  try {
    await requireAdmin()
    const eventId = new URL(request.url).searchParams.get('event_id')
    if (!eventId) throw new ApiError(400, 'VALIDATION_ERROR', 'event_id required')
    const vendors = await listEventVendors(eventId)
    return successResponse({ vendors })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const { liveId } = await requireAdmin()
    const body = patchSchema.parse(await request.json())
    const row = await setEventVendorStatus(body.event_id, body.vendor_user_id, body.status, liveId, {
      adminOverride: true,
    })
    await writeAdminAudit(liveId, 'event_vendor.update', body.event_id, body as Record<string, unknown>)
    return successResponse(row, body.status === 'revoked' ? 'Vendor revoked' : 'Vendor updated')
  } catch (error) {
    return handleRouteError(error)
  }
}
