import { z } from 'zod'
import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { getProfile, requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { contactEmail } from '@/lib/auth/pin'
import { clientIp, rateLimit } from '@/lib/api/rate-limit'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import {
  getOrCreateVirtualAccount,
  recreateVirtualAccount,
  virtualAccountNeedsBrandRefresh,
} from '@/lib/payments/virtual-account'
import { isPaystackConfigured } from '@/lib/env'

async function resolveFundingIdentity() {
  const user = await requireUser()
  const session = await readBuSession()
  const profile = await getProfile(user.id)
  const liveId =
    (await resolveLiveCelebrantId({
      id: user.id,
      email: user.email,
      phone: session?.phone_e164 || session?.phone || profile?.phone_e164 || profile?.phone || null,
    })) || user.id

  const email =
    contactEmail(profile?.email) || contactEmail(session?.email) || contactEmail(user.email)
  const phone = profile?.phone_e164 || profile?.phone || session?.phone_e164 || session?.phone || null
  const displayName = profile?.display_name || session?.display_name || null

  return { liveId, email, phone, displayName }
}

function publicAccount(account: Awaited<ReturnType<typeof getOrCreateVirtualAccount>>) {
  return {
    bank_name: account.bank_name,
    bank_slug: account.bank_slug,
    account_number: account.account_number,
    account_name: account.account_name,
    currency: account.currency,
    active: account.active,
    needs_brand_refresh: virtualAccountNeedsBrandRefresh(account.account_name),
  }
}

export async function GET() {
  try {
    if (!isPaystackConfigured()) {
      throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Funding is not available right now.')
    }
    const { liveId, email, phone, displayName } = await resolveFundingIdentity()
    const account = await getOrCreateVirtualAccount({
      userId: liveId,
      email,
      phone,
      displayName,
    })
    return successResponse(publicAccount(account), 'Virtual account ready')
  } catch (error) {
    return handleRouteError(error)
  }
}

const postSchema = z.object({
  recreate: z.boolean().optional(),
})

export async function POST(request: Request) {
  try {
    if (!isPaystackConfigured()) {
      throw new ApiError(503, 'PAYSTACK_REQUIRED', 'Funding is not available right now.')
    }
    const limited = rateLimit(`dva-recreate:${clientIp(request)}`, 3, 15 * 60_000)
    if (!limited.ok) {
      throw new ApiError(429, 'RATE_LIMITED', 'Wait a few minutes before requesting another account number.')
    }

    const body = postSchema.parse(await request.json().catch(() => ({})))
    if (!body.recreate) {
      throw new ApiError(400, 'INVALID_REQUEST', 'Pass recreate: true to issue a new bank account number.')
    }

    const { liveId, email, phone, displayName } = await resolveFundingIdentity()
    const account = await recreateVirtualAccount({
      userId: liveId,
      email,
      phone,
      displayName,
    })
    return successResponse(
      publicAccount(account),
      'New bank account ready. Use this number for transfers going forward.',
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
