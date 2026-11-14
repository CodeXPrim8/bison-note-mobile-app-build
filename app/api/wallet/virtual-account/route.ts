import { handleRouteError, successResponse, ApiError } from '@/lib/api/errors'
import { getProfile, requireUser } from '@/lib/api/session'
import { readBuSession } from '@/lib/auth/bu-session'
import { contactEmail } from '@/lib/auth/pin'
import { resolveLiveCelebrantId } from '@/lib/events/live'
import { getOrCreateVirtualAccount } from '@/lib/payments/virtual-account'
import { isPaystackConfigured } from '@/lib/env'

export async function GET() {
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

    const email =
      contactEmail(profile?.email) || contactEmail(session?.email) || contactEmail(user.email)
    const phone = profile?.phone_e164 || profile?.phone || session?.phone_e164 || session?.phone || null
    const displayName = profile?.display_name || session?.display_name || null

    const account = await getOrCreateVirtualAccount({
      userId: liveId,
      email,
      phone,
      displayName,
    })

    return successResponse(
      {
        bank_name: account.bank_name,
        bank_slug: account.bank_slug,
        account_number: account.account_number,
        account_name: account.account_name,
        currency: account.currency,
        active: account.active,
      },
      'Virtual account ready',
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
