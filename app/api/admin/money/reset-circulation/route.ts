import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { requireAdminPin } from '@/lib/admin/user-auth'
import { resetCirculation } from '@/lib/admin/reset-circulation'
import { pinSchema } from '@/lib/auth/pin'

const bodySchema = z.object({
  admin_pin: pinSchema,
  confirm: z.literal('ZERO'),
})

export async function POST(request: Request) {
  try {
    const { db, liveId, session } = await requireAdmin()
    const body = bodySchema.parse(await request.json())
    const adminPhone = session?.phone_e164 || session?.phone || null
    await requireAdminPin(adminPhone, body.admin_pin)

    const result = await resetCirculation(db, liveId)
    if (result.failures.length && result.wallets_zeroed === 0 && result.cancelled_withdrawals === 0) {
      throw new ApiError(500, 'RESET_FAILED', result.failures[0]?.error || 'Could not reset circulation')
    }

    return successResponse(
      result,
      `Cleared ₦${result.naira_cleared.toLocaleString('en-NG')} across ${result.wallets_zeroed} wallet${
        result.wallets_zeroed === 1 ? '' : 's'
      }; cancelled ${result.cancelled_withdrawals} withdrawal${result.cancelled_withdrawals === 1 ? '' : 's'}`,
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
