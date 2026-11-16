import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireAdmin } from '@/lib/admin/session'
import { autoReverseFailedDebits, reverseDebitByReference } from '@/lib/wallet/reverse'

const schema = z.object({
  reference: z.string().min(3).max(120).optional(),
  sweep: z.boolean().optional(),
})

/** Admin: reverse one failed debit by reference, or sweep all queued/failed purchase debits. */
export async function POST(request: Request) {
  try {
    await requireAdmin()
    const body = schema.parse(await request.json().catch(() => ({})))

    if (body.reference) {
      const result = await reverseDebitByReference(body.reference)
      return successResponse(result, result.already_reversed ? 'Already reversed' : 'Reversed')
    }

    if (body.sweep === false && !body.reference) {
      throw new ApiError(400, 'REFERENCE_REQUIRED', 'Pass reference or sweep: true')
    }

    const sweep = await autoReverseFailedDebits({ limit: 300, immediate: true })
    return successResponse(sweep, `Reversed ${sweep.reversed} debit(s)`)
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function GET() {
  try {
    await requireAdmin()
    const sweep = await autoReverseFailedDebits({ limit: 300, immediate: true })
    return successResponse(sweep, `Reversed ${sweep.reversed} debit(s)`)
  } catch (error) {
    return handleRouteError(error)
  }
}
