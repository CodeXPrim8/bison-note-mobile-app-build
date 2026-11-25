import { handleRouteError, successResponse } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { listOpenGifts } from '@/lib/purpose-gifts'

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
    const gifts = await listOpenGifts(liveId)
    return successResponse({ gifts })
  } catch (error) {
    return handleRouteError(error)
  }
}
