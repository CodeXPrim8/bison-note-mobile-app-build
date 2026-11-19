import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { canUseVendorMode, getAccountRolesForViewer } from '@/lib/account/roles'
import { listVendorPosSales, updatePosSaleStatus } from '@/lib/pos/sales'

const patchSchema = z.object({
  sale_id: z.string().uuid(),
  status: z.enum(['confirmed', 'notes_issued', 'cancelled']),
})

async function vendorLiveId(user: { id: string; email?: string | null }) {
  const session = await readBuSession()
  return (
    (await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || null,
    })) || user.id
  )
}

export async function GET() {
  try {
    const user = await requireUser()
    const session = await readBuSession()
    const liveId = await vendorLiveId(user)
    const roles = await getAccountRolesForViewer(liveId, session)
    if (!canUseVendorMode(roles)) {
      throw new ApiError(403, 'FORBIDDEN', 'Vendor role required.')
    }
    const sales = await listVendorPosSales(liveId, 60)
    return successResponse({ sales })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser()
    const session = await readBuSession()
    const liveId = await vendorLiveId(user)
    const roles = await getAccountRolesForViewer(liveId, session)
    if (!canUseVendorMode(roles)) {
      throw new ApiError(403, 'FORBIDDEN', 'Vendor role required.')
    }
    const body = patchSchema.parse(await request.json())
    const sale = await updatePosSaleStatus({
      saleId: body.sale_id,
      vendorUserId: liveId,
      status: body.status,
    })
    return successResponse(sale, 'Updated')
  } catch (error) {
    return handleRouteError(error)
  }
}
