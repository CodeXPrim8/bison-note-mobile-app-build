import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { getProfile, requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { syncUserDedicatedNubanCredits } from '@/lib/payments/dva-credit'
import { isPaystackConfigured } from '@/lib/env'

export async function POST() {
  try {
    if (!isPaystackConfigured()) {
      throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Paystack is not configured.')
    }
    const user = await requireUser()
    const session = await readBuSession()
    const profile = await getProfile(user.id)
    const liveId =
      (await resolveLiveCelebrantId({
        id: user.id,
        email: user.email,
        phone: session?.phone_e164 || session?.phone || profile?.phone_e164 || profile?.phone || null,
      })) || user.id

    const result = await syncUserDedicatedNubanCredits(liveId)
    return successResponse(result, result.credited.length ? 'Top-up credited' : 'No new bank transfers')
  } catch (error) {
    return handleRouteError(error)
  }
}
