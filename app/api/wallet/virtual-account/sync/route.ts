import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { getProfile, requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { syncUserDedicatedNubanCredits } from '@/lib/payments/dva-credit'
import { isPaystackConfigured } from '@/lib/env'

export async function POST(request: Request) {
  try {
    if (!isPaystackConfigured()) {
      throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Funding sync is not available right now.')
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

    let requery = true
    try {
      const body = (await request.json()) as { requery?: boolean }
      if (typeof body?.requery === 'boolean') requery = body.requery
    } catch {
      requery = true
    }

    const result = await syncUserDedicatedNubanCredits(liveId, { requery })
    return successResponse(result, result.credited.length ? 'Top-up credited' : 'No new bank transfers')
  } catch (error) {
    return handleRouteError(error)
  }
}
