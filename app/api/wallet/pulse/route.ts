import { handleRouteError, successResponse } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { fetchLiveWallet, resolveLiveCelebrantId } from '@/lib/events/live'

export const dynamic = 'force-dynamic'

/** Balance only. Polled while the app is open so incoming ɃU shows without a refresh. */
export async function GET() {
  try {
    const user = await requireUser()
    const session = await readBuSession()
    const liveId =
      (await resolveLiveCelebrantId({
        id: user.id,
        email: user.email,
        phone: session?.phone_e164 || session?.phone || null,
      })) || user.id
    const wallet = await fetchLiveWallet(liveId)
    return successResponse({ user_id: liveId, wallet })
  } catch (error) {
    return handleRouteError(error)
  }
}
