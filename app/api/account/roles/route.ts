import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import {
  enableAccountRole,
  getAccountRolesForViewer,
} from '@/lib/account/roles'

const bodySchema = z.object({
  role: z.enum(['organizer', 'affiliate']),
})

export async function GET() {
  try {
    const user = await requireUser()
    const session = await readBuSession()
    const liveId = await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || null,
    })
    const accountId = liveId || user.id
    const roles = await getAccountRolesForViewer(accountId, session)
    return successResponse({
      user_id: accountId,
      is_organizer: roles.is_organizer,
      is_affiliate: roles.is_affiliate,
      affiliate_code: roles.affiliate_code,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const session = await readBuSession()
    const liveId = await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || null,
    })
    if (!liveId) {
      throw new ApiError(
        403,
        'NOT_LIVE_USER',
        'Sign in with your ɃU ID (phone) and PIN. Organiser and affiliate use that same account.',
      )
    }
    const body = bodySchema.parse(await request.json())
    const enabled = await enableAccountRole(liveId, body.role)
    const roles = await getAccountRolesForViewer(liveId, session)
    return successResponse({
      user_id: liveId,
      is_organizer: enabled.is_organizer || roles.is_organizer,
      is_affiliate: enabled.is_affiliate || roles.is_affiliate,
      affiliate_code: enabled.affiliate_code || roles.affiliate_code,
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
